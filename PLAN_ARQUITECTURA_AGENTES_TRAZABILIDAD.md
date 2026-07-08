# Plan Ejecutivo: Arquitectura de Agentes Orquestados
## Sistema de Trazabilidad Logística con Cámaras LPR - Vicentin

**Fecha**: Julio 2026  
**Versión**: 1.0  
**Estado**: Plan de Implementación  

---

## 1. DIAGNÓSTICO INICIAL DEL PROBLEMA

### Situación Actual
El sistema de trazabilidad opera con componentes desacoplados que generan inconsistencias:

- **Lectura LPR inconsistente**: Las cámaras capturan eventos pero la calidad varía por posición, iluminación y contexto operativo (camión parado, en movimiento, parcialmente oculto).
- **Desalineación de datos**: Los eventos Truckflow no siempre coinciden temporalmente con los registros en Excel de movimientos. Hay desfases de minutos a horas que generan ruido en validaciones.
- **Lógica de circuitos dispersa**: Los tramos de cada circuito (plantas, checkpoints, secuencias) están documentados en múltiples lugares sin versión única de verdad.
- **Errores en circuitos de aceite especialmente**: Hay registros de camiones que "saltean" plantas, aparecen en el orden incorrecto en secuencias, o generan loops internos no explicados por variaciones operativas reales (espera, recalado, rechazo).
- **Validación manual**: Comité detecta errores a posteriori en presentaciones. No hay validación automática antes de reportar.
- **Presentaciones manuales**: Cada informe ejecutivo requiere extracción y transformación manual. Riesgo alto de error transcripción y desfase temporal.

### Impacto Operativo
- Falta de confianza en los datos presentados a directivos.
- Incapacidad de detectar anomalías en tiempo real.
- Carga operativa alta en revisión y corrección manual.
- No hay trazabilidad completa de por qué un circuito fue clasificado como "exitoso" o "con error".

### Root Cause: Falta de Orquestación
Los componentes (LPR, Truckflow, Excel, reglas) actúan independientemente sin un coordinador que verifique calidad, coherencia y completitud en cada paso.

---

## 2. ARQUITECTURA PROPUESTA DE AGENTES

```
┌─────────────────────────────────────────────────────────────┐
│         AGENTE ORQUESTADOR DEL PROGRAMA                      │
│  (Coordinador central, validador de flujo, auditor)         │
└─────────┬──────────────┬──────────────┬──────────────┬─────┘
          │              │              │              │
    ┌─────▼──┐      ┌────▼────┐   ┌────▼────┐   ┌────▼──────┐
    │ AGENTE │      │ AGENTE  │   │ AGENTE  │   │ AGENTE    │
    │INFRAES-│      │CIRCUITOS│   │ DATOS Y │   │ ANÁLISIS  │
    │TRUCTURA│      │  Y OPE- │   │TRAZABIL.│   │ EJECUTIVO │
    │  LPR   │      │ RACIÓN  │   │         │   │ Y COMITÉ  │
    └────┬───┘      └────┬────┘   └────┬────┘   └────┬──────┘
         │               │              │             │
         │               │              │             │
    [Calidad]     [Definición de] [Cruce de]  [Generación]
    [LPR]         [secuencias]    [fuentes]   [reportes]
    [Eventos]     [Validación]    [Anomalías] [Exec]
                  [por circuito]  [Auditoría]
```

### Principios de Diseño
1. **Responsabilidad única pero completa**: Cada agente es dueño de un dominio funcional completo, no de un paso del proceso.
2. **Sin aislamiento absoluto**: Los agentes se comunican con el orquestador. El orquestador es el coordinador, no un director micromanager.
3. **Idempotencia**: Las operaciones de cada agente deben poder ejecutarse múltiples veces sin efectos secundarios.
4. **Auditoría integrada**: Cada agente produce logs estructurados que el orquestador puede auditar.

---

## 3. RESPONSABILIDAD EXACTA DE CADA AGENTE

### 3.1 AGENTE ORQUESTADOR DEL PROGRAMA
**Rol**: Coordinador central, validador de flujos, gestor de dependencias.

**Responsabilidades**:
- Iniciar ejecuciones programadas o bajo demanda.
- Verificar que la infraestructura esté disponible antes de procesar.
- Invocar a otros agentes en orden correcto (dependencias).
- Validar que cada agente completó su tarea sin errores críticos.
- Manejo de fallos: reintentos, escalación, notificaciones.
- Auditoría de trail completo: quién hizo qué, cuándo, con qué datos.
- Decidir si proceder a siguiente fase o abortar.
- Entregar resultados finales en formato consensuado.

**NO hace**:
- Procesar datos de LPR.
- Validar reglas de circuitos.
- Generar gráficos.
- Almacenar datos: es un coordinador, no un repositorio.

**Estado a mantener**:
- Timestamp de última ejecución exitosa por agente.
- Status actual (inicializado, en ejecución, completado, fallido).
- Errores no críticos encontrados durante la ejecución.

### 3.2 AGENTE INFRAESTRUCTURA LPR
**Rol**: Gestor de calidad de datos brutos de cámaras.

**Responsabilidades**:
- Consultar eventos Truckflow (capturados por cámaras).
- Validar integridad de lectura: formato, campos obligatorios, rango de valores.
- Detectar lecturas duplicadas o sospechosas (ej: mismo vehículo en dos cámaras simultáneamente sin tiempo físicamente posible).
- Clasificar eventos por confianza de lectura (alta, media, baja) según contexto: hora del día, iluminación estimada, velocidad de captura.
- Registrar anomalías LPR: lecturas parciales, baja visibilidad, cambios de patente detectados (posibles errores OCR).
- Generar reporte de "calidad de captura por planta y período".
- Proponer cuarentena de eventos de baja confianza (no descartar, marcar para revisión manual).

**NO hace**:
- Interpretar si un circuito es válido.
- Comparar con Excel.
- Generar reportes ejecutivos.

**Entradas esperadas**:
- Rango de fechas.
- Lista de plantas a auditar.
- Umbral de confianza mínima aceptable.

**Salida**:
```json
{
  "timestamp_procesamiento": "2026-07-07T14:30:00Z",
  "periodo": {"desde": "2026-07-01", "hasta": "2026-07-07"},
  "plantas_auditadas": ["Planta_Centro", "Planta_Norte"],
  "eventos_procesados": 5420,
  "eventos_validos": 5390,
  "eventos_cuarentena": 30,
  "calidad_por_planta": {
    "Planta_Centro": {
      "confianza_promedio": 0.94,
      "eventos_baja_confianza": 8
    },
    "Planta_Norte": {
      "confianza_promedio": 0.89,
      "eventos_baja_confianza": 22
    }
  },
  "anomalias_detectadas": [
    {"tipo": "lectura_duplicada", "evento_id": "EV123", "detalles": "..."}
  ],
  "apto_para_procesar": true,
  "observaciones": "Planta_Norte tiene 22 eventos con baja confianza. Revisar iluminación."
}
```

### 3.3 AGENTE CIRCUITOS Y OPERACIÓN
**Rol**: Gestor de definiciones de circuitos y clasificación de trazas.

**Responsabilidades**:
- Mantener versión única de verdad de circuitos: secuencia de plantas, checkpoints, order esperado.
- Recibir lista de eventos válidos del Agente Infraestructura.
- Recibir movimientos de Excel.
- Recibir trazas (secuencias de eventos) del Agente Datos y Trazabilidad.
- Clasificar cada traza contra circuitos definidos:
  - ✓ Válido: sigue secuencia esperada, sin saltos, sin inversiones.
  - ⚠ Con variación operativa: espera en planta, recalado (revisita planta), rechazo (no continúa), loop interno.
  - ✗ Inválido: salto de plantas, orden incorrecta, falta eventos críticos.
- Generar explicación legible de por qué un circuito es válido o no.
- Para circuitos de aceite específicamente: verificar reglas adicionales (peso, pureza de ruta).
- Registrar cambios en definiciones de circuitos (auditoría de versiones).

**NO hace**:
- Evaluar si los datos de LPR son correctos (eso hace Infraestructura).
- Generar gráficos o reportes ejecutivos.

**Entradas**:
- Eventos validados.
- Movimientos de Excel.
- Timestamp de ejecutable.

**Salida**:
```json
{
  "timestamp_procesamiento": "2026-07-07T14:35:00Z",
  "trazas_procesadas": 847,
  "trazas_validas": 823,
  "trazas_con_variacion": 18,
  "trazas_invalidas": 6,
  "circuitos_aceite_evaluados": 234,
  "circuitos_aceite_validos": 232,
  "circuitos_aceite_con_anomalia": 2,
  "clasificaciones": [
    {
      "id_traza": "TR001",
      "circuito_esperado": "Centro_a_Norte_Aceite",
      "resultado": "valido",
      "eventos_contabilizados": 4,
      "variaciones": []
    },
    {
      "id_traza": "TR002",
      "circuito_esperado": "Centro_a_Norte_Aceite",
      "resultado": "invalido",
      "motivo": "Salto de planta intermedia (Planta_Intermedia)",
      "eventos_capturados": ["Centro", "Norte"],
      "eventos_esperados": ["Centro", "Intermedia", "Norte"]
    }
  ],
  "auditorias_aceite": [
    {
      "id_traza": "TR101",
      "resultado": "con_anomalia",
      "anomalia": "Peso registrado (980 kg) inconsistente con estándar (1000-1100 kg)"
    }
  ],
  "definicion_circuitos_version": "v2.1",
  "cambios_desde_ultima_ejecucion": 0
}
```

### 3.4 AGENTE DATOS Y TRAZABILIDAD
**Rol**: Integrador de fuentes y detector de anomalías.

**Responsabilidades**:
- Consultar Excel de movimientos (contrato, planta origen, planta destino, fecha, vehículo).
- Consultar eventos LPR validados del Agente Infraestructura.
- Construir trazas: secuencia cronológica de eventos para cada vehículo/movimiento.
- Hacer "join" entre Excel y eventos LPR: asignar eventos LPR a movimientos Excel por coincidencia de vehículo y ventana temporal.
- Detectar anomalías de trazabilidad:
  - Movimiento en Excel sin correspondencia en LPR (vehículo no fue capturado).
  - Evento LPR sin correspondencia en Excel (cámara capturó algo no documentado).
  - Desfase temporal significativo (evento ocurrió mucho después del tiempo esperado).
  - Eventos fuera de secuencia lógica.
- Generar reporte de "cobertura de trazabilidad" por período, planta, tipo de carga.
- Mantener log de auditoría de cruce de fuentes (qué evento se emparejó con qué movimiento, con qué confianza).

**NO hace**:
- Decidir si un circuito es válido (eso hace Circuitos y Operación).
- Generar presentaciones.

**Entradas**:
- Rango de fechas.
- Eventos LPR validados y calificados.
- Extracto de Excel de movimientos.

**Salida**:
```json
{
  "timestamp_procesamiento": "2026-07-07T14:40:00Z",
  "periodo": {"desde": "2026-07-01", "hasta": "2026-07-07"},
  "movimientos_excel": 847,
  "eventos_lpr": 5390,
  "trazas_construidas": 847,
  "trazas_con_cobertura_completa": 823,
  "trazas_con_cobertura_parcial": 18,
  "trazas_sin_cobertura": 6,
  "anomalias_detectadas": {
    "movimiento_sin_evento": 3,
    "evento_sin_movimiento": 24,
    "desfase_temporal_significativo": 5,
    "fuera_de_secuencia": 2
  },
  "cobertura_por_planta": {
    "Planta_Centro": {"trazas": 234, "con_cobertura": 230, "tasa": 0.983},
    "Planta_Norte": {"trazas": 245, "con_cobertura": 241, "tasa": 0.984}
  },
  "trazas": [
    {
      "id": "TR001",
      "vehiculo": "ABC123",
      "movimiento_excel": "MV001",
      "contrato": "CNT-2026-001",
      "ruta": "Centro → Intermedia → Norte",
      "eventos_capturados": 4,
      "eventos_esperados": 4,
      "cobertura": 1.0,
      "anomalias": []
    },
    {
      "id": "TR002",
      "vehiculo": "XYZ789",
      "movimiento_excel": null,
      "anomalia": "Evento LPR sin correspondencia en Excel",
      "evento_ids": ["EV456", "EV457"]
    }
  ]
}
```

### 3.5 AGENTE ANÁLISIS EJECUTIVO Y COMITÉ
**Rol**: Generador de presentaciones y KPIs para directivos.

**Responsabilidades**:
- Recibir resultados de todos los agentes anteriores.
- Construir KPIs operativos:
  - Tasa de trazabilidad completa.
  - Tasa de circuitos válidos vs. con anomalía vs. inválidos.
  - Tiempo promedio de tránsito por ruta.
  - Circuitos de aceite: validez, anomalías de peso, desviaciones.
  - Calidad de datos LPR por planta.
- Generar presentación ejecutiva (PPTX o similar):
  - Portada: período, fecha de generación.
  - Resumen ejecutivo: KPIs principales, indicadores de alerta.
  - Detalle por área: Infraestructura, Circuitos, Trazabilidad, Aceite.
  - Anomalías encontradas y acciones recomendadas.
  - Comparación con período anterior (si aplica).
- Incluir referencias a datos fuente para trazabilidad (auditoría).
- Generar en formato que comité pueda presentar sin modificaciones.

**NO hace**:
- Modificar datos.
- Tomar decisiones operativas.

**Entradas**:
- Output de los 4 agentes anteriores.
- Template de presentación estándar.
- Datos históricos para comparación (opcional).

**Salida**:
```json
{
  "timestamp_generacion": "2026-07-07T14:45:00Z",
  "periodo": {"desde": "2026-07-01", "hasta": "2026-07-07"},
  "presentacion_generada": "Vicentin_Reporte_Trazabilidad_20260707.pptx",
  "kpis": {
    "trazabilidad": {
      "cobertura_completa": 0.972,
      "movimientos_auditados": 847,
      "movimientos_con_cobertura": 823,
      "alertas": 24
    },
    "circuitos": {
      "validos": 0.972,
      "con_variacion_operativa": 0.021,
      "invalidos": 0.007,
      "total_clasificado": 847
    },
    "aceite": {
      "circuitos_aceite_auditados": 234,
      "validos": 0.991,
      "con_anomalia": 0.009,
      "anomalias_peso": 2,
      "anomalias_ruta": 0
    },
    "infraestructura_lpr": {
      "eventos_capturados": 5420,
      "eventos_validos": 0.996,
      "confianza_promedio": 0.918,
      "plantas_en_rojo": ["Planta_Norte"]
    }
  },
  "alertas": [
    {"id": 1, "severidad": "MEDIA", "tipo": "Circuito_Invalido", "descripcion": "Vehículo ABC123 saltó Planta_Intermedia", "fecha": "2026-07-05"},
    {"id": 2, "severidad": "BAJA", "tipo": "Anomalia_Peso_Aceite", "descripcion": "Peso registrado fuera de rango", "fecha": "2026-07-06"}
  ],
  "comparacion_periodo_anterior": {
    "cobertura_mejoro": true,
    "delta_cobertura": +0.034,
    "circuitos_invalidos_mejoro": true
  }
}
```

---

## 4. QUÉ INFORMACIÓN NECESITA CADA AGENTE

| Agente | Entradas Requeridas | Fuente | Formato | Frecuencia |
|--------|---------------------|--------|---------|-----------|
| **Orquestador** | Configuración de ejecución, lista de agentes, reglas de dependencia | Archivo config o DB | JSON/YAML | Una vez (al iniciar) |
| **Infraestructura LPR** | Eventos Truckflow, rango de fechas, umbrales de confianza | API Truckflow o DB | JSON/CSV | Diaria/Bajo demanda |
| **Circuitos y Operación** | Definición de circuitos, eventos validados, movimientos Excel | Archivo de config, Agente Infraestructura, Excel | JSON + eventos | Diaria |
| **Datos y Trazabilidad** | Eventos validados, movimientos Excel, ventanas temporales | Agente Infraestructura, Excel | JSON + CSV | Diaria |
| **Análisis Ejecutivo** | Outputs de los 4 agentes anteriores, template de presentación | Archivos JSON + PPTX template | JSON + estructurado | Diaria/Bajo demanda |

---

## 5. QUÉ RESULTADO DEBE DEVOLVER CADA AGENTE

Ver secciones 3.2 a 3.5 anteriormente (Salida en formato JSON estructurado).

Adicionalmente, cada agente debe devolver:
- **Status**: OK, WARNING, CRITICAL_ERROR.
- **Timestamp**: Cuándo se ejecutó.
- **Versión de definiciones usadas** (circuitos, reglas, umbrales).
- **Log de auditoría**: Decisiones tomadas, umbrales aplicados, registros alterados.

---

## 6. CÓMO SE COMUNICAN LOS AGENTES CON EL ORQUESTADOR

### Protocolo de Comunicación

**1. Invocación (Orquestador → Agente)**
```json
{
  "execution_id": "EXEC_20260707_001",
  "agent": "AgenteDatos_Trazabilidad",
  "action": "process",
  "inputs": {
    "fecha_desde": "2026-07-01",
    "fecha_hasta": "2026-07-07",
    "eventos_lpr_file": "/data/eventos_validados_20260707.json",
    "movimientos_excel_file": "/data/movimientos_20260707.xlsx"
  },
  "timeout_segundos": 600,
  "retry_on_error": true,
  "max_retries": 2
}
```

**2. Respuesta (Agente → Orquestador)**
```json
{
  "execution_id": "EXEC_20260707_001",
  "agent": "AgenteDatos_Trazabilidad",
  "status": "OK|WARNING|CRITICAL_ERROR",
  "timestamp_inicio": "2026-07-07T14:40:00Z",
  "timestamp_fin": "2026-07-07T14:42:30Z",
  "duracion_segundos": 150,
  "resultado": { /* estructura específica del agente */ },
  "warnings": ["Planta_X no encontrada en 2 movimientos"],
  "errores_criticos": [],
  "resultado_file": "/output/resultado_20260707_trazabilidad.json",
  "version_definiciones": {"circuitos": "v2.1", "umbrales": "v1.0"},
  "audit_log": [
    {"timestamp": "...", "accion": "evento_emparejado", "detalles": "EV123 → MV001"},
    {"timestamp": "...", "accion": "anomalia_detectada", "detalles": "desfase_temporal"}
  ]
}
```

### Mecanismo de Orquestación

**Secuencia de ejecución**:
1. Orquestador verifica prerequisites (datos disponibles, agentes activos).
2. Invoca **Agente Infraestructura LPR** (independiente).
3. Espera respuesta exitosa O marca WARNING y continúa.
4. Invoca **Agente Circuitos y Operación** (depende de Infraestructura).
5. Invoca **Agente Datos y Trazabilidad** en paralelo (depende de Infraestructura).
6. Espera ambos.
7. Invoca **Agente Análisis Ejecutivo** (depende de todos).
8. Valida que presentación fue generada.
9. Registra resultado final.

**Manejo de fallos**:
- Si Infraestructura falla: ABORTAR (datos base comprometidos).
- Si Circuitos falla: CONTINUAR con WARNING (hay datos de trazabilidad).
- Si Datos y Trazabilidad falla: CONTINUAR con WARNING.
- Si Análisis Ejecutivo falla: ABORTAR (no hay presentación).

**Comunicación**: REST API o Message Queue (RabbitMQ, SQS). Preferencia: API REST con JSON, idempotencia mediante `execution_id`.

---

## 7. QUÉ DEBE AUDITARSE EN CADA ETAPA

### Matriz de Auditoría

| Etapa | Qué Auditar | Cómo | Responsable | Trigger |
|-------|-------------|------|-------------|---------|
| **Pre-ejecución** | Disponibilidad de datos, config válida, permisos | Verificar archivos / conexiones DB | Orquestador | Inicio de ejecución |
| **Infraestructura LPR** | Cada evento clasificado, umbral de confianza aplicado, anomalías detectadas | Log de decisión por evento | Agente | Durante procesamiento |
| **Circuitos y Operación** | Cada traza vs. circuito, regla aplicada, variación operativa registrada | Log de clasificación + evidencia | Agente | Durante procesamiento |
| **Datos y Trazabilidad** | Cada emparejamiento evento-movimiento, anomalía detectada, ventana temporal usada | Log de join + scoring | Agente | Durante procesamiento |
| **Análisis Ejecutivo** | KPI calculado, dato fuente, agregaciones | Log de cálculo + referencias | Agente | Durante procesamiento |
| **Post-ejecución** | Completitud, consistencia entre agentes, alertas generadas | Validación cruzada de outputs | Orquestador | Al finalizar |

### Registros a Mantener
- **Audit Trail**: Quién (agente), qué (acción), cuándo (timestamp), con qué datos (references), resultado (OK/FAIL).
- **Data Lineage**: De dónde vino cada dato en la presentación final (trazabilidad hacia atrás).
- **Versiones**: Qué versión de definiciones/reglas se usó en cada ejecución.
- **Cambios**: Cualquier cambio en la definición de circuitos se registra con fecha, autor, motivo.

### Consultas de Auditoría Críticas
1. "¿Por qué este circuito fue marcado como inválido?" → Traza desde Análisis → Circuitos → Datos → Infraestructura.
2. "¿Qué eventos LPR se perdieron?" → Comparar count(movimientos Excel) vs. count(eventos LPR).
3. "¿Qué cambió entre ayer y hoy?" → Comparar outputs, detectar diferencias.
4. "¿A qué versión de circuitos corresponde este reporte?" → Revisar version en metadata.

---

## 8. CÓMO ABORDAR PRIMERO LA CORRECCIÓN DE CIRCUITOS DE ACEITE

### Fases de Corrección

#### Fase 1: Diagnóstico (1-2 semanas)

**Paso 1.1: Extraer muestra de circuitos de aceite problemáticos**
- Filtrar en historial: circuitos etiquetados como "con error" o "requiere revisión".
- Seleccionar 20-30 casos representativos.
- Documentar para cada uno:
  - Fecha de ocurrencia.
  - Vehículo y placa.
  - Movimiento en Excel (contrato, origen, destino, peso).
  - Eventos LPR capturados (timestamps, plantas, orden).
  - Cuál fue el error detectado.
  - Quién lo detectó y cómo.

**Paso 1.2: Analizar patrón de errores**
- ¿Los eventos están fuera de orden? → Problema de secuencia LPR.
- ¿Faltan plantas en la secuencia? → Problema de cobertura LPR o salto no explicado.
- ¿Hay eventos duplicados?? → Problema de deduplicación.
- ¿El peso registrado es inconsistente? → Problema de validación de carga.
- ¿Hay loops (revisita de planta)?? → ¿Es variación operativa o error?

**Paso 1.3: Establecer definición de verdad**
- Para cada circuito de aceite, documentar:
  - Secuencia esperada de plantas.
  - Rangos aceptables de peso.
  - Variaciones operativas legales (espera, recalado, rechazo).
  - Reglas de auditoría específicas (ej: "no puede haber recalado más de 1 vez").
- Crear tabla de referencia en JSON/YAML versioned.

#### Fase 2: Corrección Manual con Auditoría (1-2 semanas)

**Paso 2.1: Ejecutar Agente Infraestructura sobre muestra histórica**
- Procesar eventos LPR de esos 20-30 casos.
- Ver si el agente los clasifica correctamente.
- Si hay divergencias, ajustar umbrales de confianza.

**Paso 2.2: Ejecutar Agente Circuitos sobre muestra**
- Procesar trazas contra definición de circuitos.
- Comparar clasificación del agente vs. clasificación manual esperada.
- Donde divergen, documentar:
  - ¿La regla del agente es incorrecta?
  - ¿La definición de circuito es incompleta?
  - ¿El evento LPR es realmente un error?

**Paso 2.3: Generar correcciones**
- Para eventos LPR claramente erróneos (ej: lectura duplicada, OCR malo): marcar con flag "cuarentena" o "corrección manual".
- Para circuitos donde la secuencia LPR es correcta pero la definición de circuito es incompleta: actualizar definición.
- Para variaciones operativas no documentadas: documentarlas.
- Crear "registro de correcciones" con evidencia.

**Paso 2.4: Re-procesar y validar**
- Volver a ejecutar agentes con correcciones aplicadas.
- Verificar que los 20-30 casos ahora se clasifican correctamente.
- Si hay aún divergencias, iterar.

#### Fase 3: Automatización con Validación (1-2 semanas)

**Paso 3.1: Crear reglas de validación específicas para aceite**
- Implementar en Agente Circuitos y Operación.
- Reglas adicionales:
  - Peso dentro de rango.
  - Sin más de N recalados.
  - Circuito completado dentro de X horas.
  - Secuencia de plantas nunca cambia.

**Paso 3.2: Ejecutar sobre datos completos recientes (2-4 semanas atrás)**
- Procesar todos los circuitos de aceite de ese período.
- Comparar resultados contra lo que está documentado en presentaciones anteriores.
- Registrar discrepancias.

**Paso 3.3: Resolución de discrepancias**
- ¿Presentación anterior era incorrecta? → Documento correctivo.
- ¿Agente está siendo demasiado estricto? → Ajustar umbrales.
- ¿Hay variación operativa no documentada? → Agregar a reglas.

#### Fase 4: Validación en Producción (1-2 semanas)

**Paso 4.1: Ejecución en paralelo**
- Ejecutar agentes sobre datos nuevos (últimos 5 días).
- Generar presentaciones con agentes + presentaciones manuales en paralelo.
- Comparar: ¿Hay grandes diferencias? ¿Falta algo?

**Paso 4.2: Ajustes finales**
- Calibrar umbrales.
- Refinar definiciones de circuitos.

**Paso 4.3: Go-live**
- Cambiar a presentaciones 100% automatizadas.

### Cronograma Total: 4-8 semanas

### Deliverables de esta fase:
1. **Documento de definición de circuitos de aceite** (JSON versioned).
2. **Registro de correcciones aplicadas** (quién, qué, cuándo, por qué).
3. **Reporte de diagnóstico** (patrones de errores encontrados).
4. **Validación cruzada** (agentes vs. manual en muestra).

---

## 9. CÓMO VALIDAR QUE LOS TRAMOS ESTÉN BIEN CORREGIDOS

### Métodos de Validación

#### V1: Validación Manual (Comité/Operaciones)
- **Quién**: Personas que actualmente revisan presentaciones.
- **Cómo**: Reciben reporte generado por agentes, verifican contra sus apuntes/Excel.
- **Checkpoint**: ¿El reporte dice lo mismo que veo en Excel?
- **Cadencia**: Semanal durante primeras 4 semanas.
- **Escalación**: Si discrepancia > 5%, parar y ajustar.

#### V2: Validación de Completitud
- **Qué**: Verificar que 100% de circuitos de aceite fueron procesados.
- **Cómo**: 
  ```
  count(circuitos_aceite_en_excel) == count(circuitos_aceite_clasificados)
  ```
- **Resultado esperado**: 1.0 (100%).
- **Cadencia**: Cada ejecución.
- **Escalación**: Si < 95%, investigar qué se perdió.

#### V3: Validación de Coherencia Interna
- **Qué**: Verificar que agentes se contradicen mutuamente.
- **Cómo**: 
  - Agente Infraestructura dice "evento A es válido" → Agente Trazabilidad debe usarlo.
  - Agente Trazabilidad dice "movimiento X tiene cobertura 100%" → Agente Circuitos debe encontrar todos los eventos.
  - Agente Circuitos clasifica como "válido" → Agente Análisis no debe listarlo en anomalías.
- **Cadencia**: Cada ejecución.

#### V4: Validación Temporal
- **Qué**: Verificar que timestamps son coherentes.
- **Cómo**: Para cada circuito, eventos deben estar en orden cronológico.
- **Resultado esperado**: 0 inversiones temporales (evento posterior a anterior).
- **Cadencia**: Cada ejecución.

#### V5: Validación contra Datos Externos
- **Qué**: Comparar clasificación de agentes vs. manifiesto físico o sistema de pesaje.
- **Cómo**: Si hay acceso a datos de pesaje, verificar que peso en agente ≈ peso en sistema.
- **Cadencia**: Mensual (muestra aleatoria).

#### V6: Regresión (Golden Dataset)
- **Qué**: Mantener conjunto de 20-30 circuitos de aceite "conocidos" (resultado esperado documentado).
- **Cómo**: Ejecutar agentes sobre estos datos, verificar que resultado == esperado.
- **Cadencia**: Cada cambio en reglas; mínimo semanal.
- **Automatización**: Parte de CI/CD (si hay).

### Dashboard de Validación (para Orquestador)
```json
{
  "validaciones": {
    "completitud": {"estado": "OK", "tasa": 1.0, "threshold": 0.95},
    "coherencia": {"estado": "OK", "inconsistencias": 0, "threshold": 0},
    "temporal": {"estado": "OK", "inversiones": 0, "threshold": 0},
    "regresion_golden_dataset": {"estado": "OK", "match_rate": 1.0, "threshold": 0.95},
    "comparacion_con_manual": {"estado": "WARNING", "delta": 0.032, "threshold": 0.05}
  },
  "apto_para_produccion": true,
  "alertas_pendientes": ["Investigar 3 circuitos con discrepancia en peso"]
}
```

---

## 10. CÓMO PASAR LUEGO A GENERACIÓN AUTOMÁTICA DE INFORMES

### Precondiciones
- Agentes funcionan con confianza en Fase 4 (validación en producción).
- Validaciones pasan regularmente (V1-V6).
- Comité ha aprobado formato de presentaciones generadas.

### Fase 5: Automatización de Reportes (2-3 semanas)

#### Paso 5.1: Definir Estándares de Presentación
- **Template PPTX**: Estructura de slides, colores, fuentes.
- **Secciones obligatorias**:
  - Portada: período, fecha, generado automáticamente.
  - Resumen ejecutivo: 5 KPIs principales + alertas.
  - Detalle por área: 4-5 slides (uno por agente).
  - Anomalías: listado con severidad.
  - Comparación período anterior: trending.
  - Apéndice: datos detallados, referencias.
- **Documentar restricciones**: Mínimo/máximo slide, max caracteres por slide.

#### Paso 5.2: Implementar Generador de Presentaciones
- Usar librería (python-pptx, Apache POI, etc.).
- Agente Análisis Ejecutivo:
  1. Recibe KPIs en JSON.
  2. Instancia template.
  3. Reemplaza placeholders con datos reales.
  4. Inserta gráficos (matplotlib → imágenes PNG → slides).
  5. Genera PPTX.
- Validaciones:
  - PPTX generado correctamente (no corrupto).
  - Todas las slides presentes.
  - Datos numéricos coinciden con JSON.

#### Paso 5.3: Definir Distribución
- **Salida**: Archivo PPTX + JSON de datos + log de auditoría.
- **Ubicación**: Directorio compartido o repositorio (con versionado).
- **Naming**: `Vicentin_Trazabilidad_YYYYMMDD_HHMMSS.pptx`.
- **Notificaciones**: Email a comité que reporte está listo.
- **Retención**: Mantener últimos 52 reportes (1 año).

#### Paso 5.4: Integración con Orquestador
- Agregar paso de "generar reporte" automático al flujo.
- Trigger: Diariamente a las 06:00 AM (antes de reuniones).
- O: Bajo demanda vía API.

#### Paso 5.5: Prueba de Carga
- Generar 10 reportes seguidos, medir tiempo.
- Objetivo: < 5 minutos total.
- Si > 5 minutos: optimizar (paralelización, caché).

### Fase 6: Publicación a Directivos (1 semana)

- **Canal**: Email + portal (si existe).
- **Formato**: PDF principal (por impresión) + PPTX (por edición).
- **Acompañamiento**: Email resumen ejecutivo + link a datos completos.
- **Feedback loop**: Formulario de comentarios para mejoras.

### Cronograma: 3-4 semanas desde Fase 4.

### Deliverables:
1. **Template PPTX versioned**.
2. **Script/módulo de generación** (código fuente + tests).
3. **Manual de uso** (cómo generar ad-hoc, cómo cambiar template).
4. **SLA de generación** (tiempo máximo, retries, alertas de fallo).

---

## 11. RIESGOS PRINCIPALES

### Tabla de Riesgos

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|--------------|--------|-----------|
| R1 | Infraestructura LPR proporciona datos de baja calidad sin mejora rápida | MEDIA | ALTO | Fase 1: Auditar calidad LPR antes de escalar. Documentar gap. Escalada a operaciones de infraestructura. Timeline: 2 semanas max. |
| R2 | Definición de circuitos incompleta/contradictoria | MEDIA | ALTO | Fase 1: Diagnosticar. Crear "fuente de verdad" versioned. Involucrar a operaciones. Validar contra 20-30 casos manuales. |
| R3 | Excel de movimientos y Truckflow tienen timestamps inconsistentes | MEDIA | MEDIO | Fase 2: Ajustar ventanas temporales de emparejamiento. Agente Datos y Trazabilidad detecta desfases, los registra. Manual review inicial. |
| R4 | Agentes generan salida incorrecta sin ser detectado | MEDIO | CRÍTICO | Todos: Unit tests en cada agente. Validación de schema JSON. Auditoría de trail. Validación cruzada entre agentes. Golden dataset. |
| R5 | Presentaciones automatizadas tienen errores de formato | BAJO | MEDIO | Fase 5: Tests de generación PPTX. Validación de estructura. Comité revisa 3-5 reportes antes de go-live. |
| R6 | Cambio en reglas de negocio no se propaga a agentes | BAJO | MEDIO | Protocolo de versionado de definiciones. Agentes registran versión usada. Changelog obligatorio. Rollback si es necesario. |
| R7 | Performance: Agentes tardan más de 30 min para procesar 1 semana | BAJO | MEDIO | Monitorear tiempos. Paralellizar Circuitos + Trazabilidad. Caché de eventos validados. Ajustar si > 20 min. |
| R8 | Disponibilidad de datos: Excel no se actualiza a tiempo | MEDIO | MEDIO | Verificación de prerrequisitos. Orquestador verifica timestamp de Excel antes de procesar. Alerta si > 24h sin actualización. |
| R9 | Comité rechaza formato de presentaciones automatizadas | BAJO | MEDIO | Fase 4: Validación paralela. Presentación piloto a comité. Feedback temprano. Iteraciones antes de go-live. |
| R10 | Falta de adopción: Operaciones sigue usando proceso manual | BAJO | BAJO | Change management: Capacitación, demos, SOP. Automatización full. Dejar manual como fallback inicial. |

### Medidas Preventivas Generales
- **Auditoría continua**: Logs estructurados en cada agente.
- **Testing**: Unit tests para reglas, integración tests para agentes, regression tests con golden dataset.
- **Versioning**: Todas las definiciones (circuitos, reglas, umbrales) versionadas en Git.
- **Change control**: Cualquier cambio requiere revisión + aprobación + ticket de seguimiento.
- **Escalación**: Protocolo claro de quién contactar si hay fallo.

---

## 12. ORDEN RECOMENDADO DE IMPLEMENTACIÓN

### Sprint 0: Preparación (1 semana)

**Objetivo**: Estructurar proyecto, setup técnico.

- [ ] Crear repositorio Git con estructura de agentes.
- [ ] Definir API/protocolo de comunicación Orquestador ↔ Agentes.
- [ ] Setup de infraestructura de logging centralizado.
- [ ] Documentar "fuente de verdad" inicial de circuitos (archivo JSON).
- [ ] Recopilar datos históricos de muestra.

### Sprint 1: Agente Infraestructura LPR (2 semanas)

**Objetivo**: Validar calidad de datos LPR.

- [ ] Implementar Agente Infraestructura LPR.
- [ ] Conectar a Truckflow (test + producción).
- [ ] Implementar lógica de clasificación de confianza.
- [ ] Tests unitarios.
- [ ] Ejecutar sobre 1 semana de datos históricos.
- [ ] Auditar resultado: ¿eventos correctos clasificados? ¿eventos malos marcados en cuarentena?
- [ ] Deliverable: Reporte de calidad LPR por planta.

### Sprint 2: Agente Circuitos y Operación (2 semanas)

**Objetivo**: Clasificar trazas vs. definición de circuitos.

- [ ] Implementar Agente Circuitos y Operación.
- [ ] Conectar a Agente Infraestructura (usar output como input).
- [ ] Implementar lógica de clasificación.
- [ ] Implementar lógica de detección de variaciones operativas.
- [ ] Auditoría específica para aceite.
- [ ] Tests unitarios.
- [ ] Ejecutar sobre 1 semana de datos + 20-30 circuitos problemáticos.
- [ ] Comparar vs. manual: ¿resultados coinciden?
- [ ] Deliverable: Análisis de discrepancias + ajustes de reglas.

### Sprint 3: Agente Datos y Trazabilidad (2 semanas)

**Objetivo**: Cruzar Excel + LPR, detectar anomalías.

- [ ] Implementar Agente Datos y Trazabilidad.
- [ ] Conectar a Agente Infraestructura + Excel.
- [ ] Implementar lógica de emparejamiento evento-movimiento.
- [ ] Implementar detección de anomalías.
- [ ] Tests unitarios.
- [ ] Ejecutar sobre 1 semana de datos.
- [ ] Auditar: ¿emparejamientos correctos? ¿anomalías detectadas correctamente?
- [ ] Deliverable: Reporte de trazabilidad + anomalías.

### Sprint 4: Agente Orquestador (1-2 semanas)

**Objetivo**: Coordinar ejecución de agentes.

- [ ] Implementar Agente Orquestador.
- [ ] Implementar API REST para invocación de agentes.
- [ ] Implementar manejo de dependencias y fallos.
- [ ] Implementar auditoría de trail.
- [ ] Implementar validación de prerrequisitos.
- [ ] Tests de integración: ejecutar todos los agentes end-to-end.
- [ ] Ejecutar 3-5 veces sobre diferentes períodos, auditar resultados.
- [ ] Deliverable: Orquestador funcional, documentación de API.

### Sprint 5: Corrección de Circuitos de Aceite (3-4 semanas)

**Objetivo**: Resolver errores en aceite, validar con comité.

- [ ] Ejecutar Sprint 1-4 sobre historial completo de aceite.
- [ ] Diagnosticar patrones de error (Sprint 1 de Sección 8).
- [ ] Corregir eventos LPR problemáticos (marcado con cuarentena o flag).
- [ ] Actualizar definiciones de circuitos si es necesario.
- [ ] Re-ejecutar con correcciones.
- [ ] Validación manual con comité/operaciones (V1).
- [ ] Iterar hasta 100% de validación en muestra.
- [ ] Ejecutar sobre datos completos de 2-4 semanas atrás.
- [ ] Deliverable: Registro de correcciones + validación cruzada.

### Sprint 6: Agente Análisis Ejecutivo (2 semanas)

**Objetivo**: Generar presentaciones.

- [ ] Implementar Agente Análisis Ejecutivo.
- [ ] Implementar cálculo de KPIs.
- [ ] Diseñar template PPTX.
- [ ] Implementar generador de presentaciones.
- [ ] Tests de generación PPTX.
- [ ] Generar 5 reportes, revisar manualmente: ¿datos correctos? ¿formato OK?
- [ ] Presentar a comité para feedback.
- [ ] Deliverable: PPTX template + generador funcional.

### Sprint 7: Validación en Producción (2-3 semanas)

**Objetivo**: Correr agentes sobre datos nuevos, comparar con presentaciones manuales.

- [ ] Ejecución paralela: agentes + manual.
- [ ] Comparación diaria: ¿divergencias? ¿por qué?
- [ ] Ajustes de umbrales, definiciones si es necesario.
- [ ] Validación de todos los tests (V1-V6 de Sección 9).
- [ ] Aprobación de comité.
- [ ] Deliverable: Validación cruzada aprobada, SOP.

### Sprint 8: Go-Live (1-2 semanas)

**Objetivo**: Pasar a automatización completa, setup de distribución.

- [ ] Integración de generación de reportes en Orquestador.
- [ ] Setup de scheduling (diario a las 06:00 AM).
- [ ] Setup de distribución (email, portal).
- [ ] Capacitación a comité / operaciones.
- [ ] Runbook de troubleshooting.
- [ ] Monitoreo: alertas si generación falla.
- [ ] Deliverable: Reportes automatizados en producción.

### Timeline Total: 14-16 semanas (3.5-4 meses)

### Hitos Críticos:
- Fin Sprint 1: Confianza en datos LPR.
- Fin Sprint 3: Confianza en emparejamiento Excel ↔ LPR.
- Fin Sprint 5: Circuitos de aceite corregidos y validados.
- Fin Sprint 7: Sistema listo para producción.

---

## 13. QUÉ ARCHIVOS, TABLAS O EVIDENCIAS HABRÍA QUE REVISAR PRIMERO

### Paso 1: Auditoria de Fuentes de Datos (Semana 1)

**1.1 Excel de Movimientos**
- [ ] Ubicación exacta del archivo.
- [ ] Estructura: columnas, tipos de datos, validaciones.
- [ ] Frecuencia de actualización.
- [ ] Casos de uso:
  - ¿Qué rango de fechas cubre?
  - ¿Todos los vehículos están aquí?
  - ¿Hay duplicados?
  - ¿Hay blancos/nulos en campos clave (placa, origen, destino, fecha)?
- [ ] Muestra: extraer 100 registros aleatorios, verificar integridad.
- [ ] Historial de cambios: ¿se corrige manualmente? ¿cuándo fue la última corrección?

**1.2 Truckflow (Eventos LPR)**
- [ ] Acceso a API Truckflow.
- [ ] Estructura de respuesta: campos disponibles, tipos, formatos.
- [ ] Frecuencia de actualización (real-time, batch diario, otra).
- [ ] Período de retención: ¿cuánto histórico está disponible?
- [ ] Cámaras por planta: ubicación, secuencia esperada.
- [ ] Muestra: extraer eventos de 1 día completo, analizar:
  - ¿Orden cronológico?
  - ¿Duplicados?
  - ¿Campos faltantes?
  - ¿OCR errors (patentes ilegibles)?

**1.3 Definición de Circuitos**
- [ ] Dónde está documentada (archivo, DB, o es tácita).
- [ ] Por cada circuito: origen, destino, secuencia de plantas intermedias.
- [ ] Circuitos de aceite específicamente: variaciones por tipo de aceite, peso estándar, reglas especiales.
- [ ] Versión actual: ¿hay historial de cambios?
- [ ] Casos edge case documentados: espera, recalado, rechazo.

**1.4 Presentaciones Manuales Actuales**
- [ ] Ubicación de 3-5 reportes recientes.
- [ ] Estructura: qué KPIs, qué alertas, qué formato.
- [ ] Datos fuente: para cada KPI, ¿de dónde se extrae?
- [ ] Errores encontrados: lista de correcciones manuales que se hacen habitualmente.

### Paso 2: Auditoría de Procesos (Semana 1-2)

**2.1 Proceso Actual de Generación de Reportes**
- [ ] Timeline: cuándo se inicia, cuándo se entrega.
- [ ] Personas involucradas: quién extrae datos, quién valida, quién genera presentación, quién la entrega.
- [ ] Herramientas usadas: SQL, Excel macros, Python scripts, manual copy-paste.
- [ ] Validaciones manuales: qué se revisa antes de entregar.
- [ ] SLA: cuál es el tiempo máximo permitido desde datos disponibles hasta entrega.

**2.2 Errores Típicos Encontrados**
- [ ] Crear lista de últimos 10 errores encontrados en presentaciones.
- [ ] Clasificar: ¿datos incorrectos? ¿cálculo incorrecto? ¿formato incorrecto?
- [ ] Root cause de cada uno.
- [ ] Cómo se detectó y corrigió.

**2.3 Cambios en Reglas de Negocio**
- [ ] Historial de cambios en definición de circuitos (últimos 12 meses).
- [ ] Historial de cambios en KPIs (últimos 12 meses).
- [ ] Quién puede autorizar cambios, protocolo de aprobación.

### Paso 3: Análisis de Circuitos de Aceite Problemáticos (Semana 2-3)

**3.1 Muestra de Circuitos con Error**
- [ ] Filtrar historial: últimos 6 meses, circuitos marcados como "con error" o "revisar".
- [ ] Seleccionar 30 casos (distribuido por mes, por planta, por tipo de error).
- [ ] Para cada uno documentar en planilla:
  - Fecha de ocurrencia.
  - Vehículo, placa.
  - Movimiento Excel: ID, contrato, origen, destino, peso.
  - Eventos LPR capturados: lista ordenada con timestamps.
  - Error detectado: descripción.
  - Quién lo detectó: persona, cómo (al revisar presentación, al revisar Excel, otra).
  - Estado: ¿corregido? ¿cómo?

**3.2 Análisis de Patrón**
- [ ] Agrupar errores por tipo:
  - Secuencia incorrecta (¿cuántos?).
  - Salto de planta (¿cuántos?).
  - Evento duplicado (¿cuántos?).
  - Peso fuera de rango (¿cuántos?).
  - Otra.
- [ ] Agrupar por planta origen/destino: ¿hay un circuito que falla más?
- [ ] Agrupar por período (mes, día de semana): ¿hay estacionalidad?
- [ ] Conclusion: ¿80% de errores son de 1-2 tipos? Eso es donde hay que enfocarse primero.

**3.3 Inspección de Datos Brutos**
- [ ] Para 5 circuitos problemáticos, traer:
  - Registro Excel completo.
  - Eventos Truckflow completos (JSON).
  - Timestamps originales, sin procesar.
- [ ] Lado a lado: ¿dónde empieza la discrepancia?
- [ ] ¿Es un problema de LPR (evento falta), de Excel (registro incorrecto), o de lógica (regla incorrecta)?

### Paso 4: Revisión de Infraestructura Técnica (Semana 1-2)

**4.1 Stack Actual**
- [ ] Dónde se almacenan datos: DB, archivos, API, otra.
- [ ] Cómo se accede: credenciales, autenticación, endpoints.
- [ ] Quién tiene acceso: personas, sistemas, scripts.
- [ ] Auditoría de acceso: logs de quién accedió cuándo.

**4.2 Limitaciones Conocidas**
- [ ] Problemas crónicos de LPR: plantas con baja confianza, horarios problemáticos, otro.
- [ ] Problemas crónicos de Excel: retrasos en actualización, inconsistencias de formato, otro.
- [ ] Performance: cómo se comporta con datos antiguos vs. nuevos.

### Checklist Completo (16 items)

```
AUDITORÍA PREVIA (semanas 1-3)

Datos:
[ ] Excel de movimientos: estructura, integridad, período cubierto
[ ] Truckflow: acceso, estructura, período disponible
[ ] Definición de circuitos: actualidad, completitud, versioning
[ ] 3-5 presentaciones manuales recientes

Procesos:
[ ] Documentación del proceso actual de reportes
[ ] Últimos 10 errores encontrados: análisis
[ ] Historial de cambios en reglas de negocio

Aceite (prioridad):
[ ] Muestra de 30 circuitos de aceite con error: documentación
[ ] Análisis de patrón de errores
[ ] 5 casos deep-dive: datos brutos sin procesar

Infraestructura:
[ ] Stack técnico documentado
[ ] Acceso y credenciales verificados
[ ] Limitaciones conocidas documentadas
```

---

## 14. QUÉ ENTREGABLES DEBERÍAMOS OBTENER AL FINAL DE CADA ETAPA

### Al Final de Sprint 0 (Preparación)
1. **Repositorio Git estructurado**
   - Carpetas: `/agents`, `/config`, `/data`, `/tests`, `/docs`.
   - README con arquitectura.
   - .gitignore, .env.example configurado.

2. **Documento de Arquitectura v1**
   - Este documento.

3. **Definición de Circuitos (JSON versioned)**
   - Estructura: `circuitos.json` con v1.0.
   - Por cada circuito: origen, destino, secuencia, reglas.
   - Git history: cambios documentados.

4. **API Spec (OpenAPI/Swagger)**
   - Endpoints: invocación de agentes, consulta de status, auditoría.

5. **Logging Infrastructure**
   - Centralizado: syslog, ELK, CloudWatch, o similar.
   - Formato estándar de logs.

---

### Al Final de Sprint 1 (Agente Infraestructura LPR)
1. **Código del Agente**
   - Módulo funcional, tests unitarios (coverage > 80%).
   - Documentación de código.

2. **Reporte de Calidad LPR (JSON)**
   - Por planta: eventos procesados, válidos, en cuarentena.
   - Confianza promedio por planta.
   - Anomalías detectadas (listado con descripción).

3. **Test Data & Golden Dataset**
   - 100 eventos LPR con resultado esperado (para regression tests).

4. **Runbook**
   - Cómo ejecutar el agente.
   - Cómo interpretar output.
   - Troubleshooting.

---

### Al Final de Sprint 2 (Agente Circuitos y Operación)
1. **Código del Agente**
   - Módulo funcional, tests unitarios.
   - Lógica de clasificación (código + documentación).

2. **Reporte de Clasificación (JSON)**
   - Trazas válidas, con variación, inválidas.
   - Para cada inválida: motivo.
   - Auditoría de aceite: circuitos con anomalía.

3. **Análisis de Discrepancias vs. Manual**
   - 20-30 circuitos problemáticos: agente vs. manual.
   - Dónde divergen, por qué.
   - Ajustes de reglas documentados.

4. **Golden Dataset Ampliado**
   - 200+ casos clasificados manualmente, resultado esperado conocido.

---

### Al Final de Sprint 3 (Agente Datos y Trazabilidad)
1. **Código del Agente**
   - Módulo funcional, tests unitarios.
   - Lógica de emparejamiento documentada.

2. **Reporte de Trazabilidad (JSON)**
   - Trazas construidas, con cobertura completa/parcial/nula.
   - Anomalías detectadas (tipo, descripción, cantidad).
   - Por planta: tasa de cobertura.

3. **Matriz de Anomalías**
   - Movimiento sin evento.
   - Evento sin movimiento.
   - Desfase temporal.
   - Fuera de secuencia.
   - Cantidad y ejemplos de cada tipo.

4. **Data Lineage Documentation**
   - Cómo se emparejó cada evento con cada movimiento.
   - Scoring de confianza del emparejamiento.

---

### Al Final de Sprint 4 (Agente Orquestador)
1. **Código del Orquestador**
   - API REST funcional.
   - Manejo de dependencias.
   - Auditoría de trail.
   - Tests de integración.

2. **Documentación de API**
   - Endpoints, parámetros, respuestas.
   - Ejemplos de invocación.
   - Manejo de errores.

3. **Auditoría Trail de 5 Ejecuciones**
   - Cada ejecución: agentes invocados, orden, status, duración.
   - Decisiones tomadas por cada agente.
   - Alertas/warnings.

4. **SLA Documented**
   - Tiempo máximo de ejecución por agente.
   - Retry policy.
   - Escalation procedure.

5. **Validation Dashboard**
   - Métricas de todos los agentes: entrada, salida, duración.

---

### Al Final de Sprint 5 (Corrección de Aceite)
1. **Registro de Correcciones**
   - 30 circuitos de aceite: problema original, acción tomada, resultado final.
   - Quién, cuándo, por qué.
   - Estados: ✓ resuelto, ⚠ parcial, ✗ no resuelto.

2. **Actualización de Definiciones de Circuitos**
   - `circuitos.json` v1.1+.
   - Changelog: qué cambió desde v1.0.
   - Git commit con explicación.

3. **Reporte de Validación Cruzada**
   - Agentes vs. manual en 30 casos: match rate.
   - Matriz de confusión (si aplica).
   - Conclusión: ¿agentes listos para producción? Sí/No con justificación.

4. **Documento de Variaciones Operativas**
   - Definición de: espera, recalado, rechazo, loop.
   - Cuándo es válido, cuándo es anomalía.
   - Ejemplos de casos reales.

---

### Al Final de Sprint 6 (Agente Análisis Ejecutivo)
1. **Código del Agente**
   - Generador de presentaciones funcional.
   - Tests de generación PPTX.

2. **Template PPTX**
   - Estructura definida.
   - Placeholders para datos.
   - Ejemplos de presentaciones generadas.

3. **KPI Specification (JSON)**
   - Definición de cada KPI: cálculo, fórmula, data source.
   - Ejemplo de KPI JSON para 1 presentación.

4. **5 Reportes Generados**
   - PPTX de ejemplo.
   - Revisión manual: ¿formato OK? ¿datos correctos?
   - Feedback de comité documentado.

---

### Al Final de Sprint 7 (Validación en Producción)
1. **Validación Cruzada (2 semanas paralelas)**
   - Reportes generados por agentes.
   - Reportes generados manualmente.
   - Comparación diaria: ¿divergencias? Si divergencias, análisis y ajuste.
   - Conclusion: ¿confianza suficiente para go-live?

2. **Test Suite Completo**
   - Unit tests (cobertura > 90%).
   - Integration tests.
   - Regression tests (golden dataset).
   - Todos pasando.

3. **Documento de SOP (Standard Operating Procedure)**
   - Cómo ejecutar el sistema.
   - Roles y responsabilidades.
   - Qué hacer si algo falla.
   - Escalation path.

4. **Sign-off de Comité**
   - Aprobación explícita de formato de presentaciones.
   - Acta de aprobación.

---

### Al Final de Sprint 8 (Go-Live)
1. **Sistema en Producción**
   - Agentes ejecutándose automáticamente (scheduled).
   - Reportes generados diariamente.
   - Distribución funcional (email, portal, repositorio).

2. **Capacitación Completada**
   - Documentación de usuario.
   - Sesiones de capacitación a comité.
   - Sesiones de capacitación a operaciones.

3. **Monitoreo Activado**
   - Alertas si generación falla.
   - Dashboard de health de agentes.
   - Logs centralizados.

4. **Runbook de Troubleshooting**
   - Errores más comunes.
   - Pasos de diagnóstico.
   - Contactos de escalación.

5. **Versión 1.0 del Sistema Documentada**
   - Arquitectura as-is (puede diferir levemente de este plan).
   - Todos los agentes documentados.
   - API documentada.
   - Datos históricos de referencia.

---

## APÉNDICE A: Estructura de Directorios Recomendada

```
vicentin-trazabilidad/
├── agents/
│   ├── orchestrator/
│   │   ├── main.py
│   │   ├── config.yaml
│   │   ├── tests/
│   │   └── README.md
│   ├── infraestructura_lpr/
│   │   ├── main.py
│   │   ├── lpr_validator.py
│   │   ├── tests/
│   │   └── README.md
│   ├── circuitos_operacion/
│   │   ├── main.py
│   │   ├── circuit_classifier.py
│   │   ├── tests/
│   │   └── README.md
│   ├── datos_trazabilidad/
│   │   ├── main.py
│   │   ├── trace_builder.py
│   │   ├── anomaly_detector.py
│   │   ├── tests/
│   │   └── README.md
│   └── analisis_ejecutivo/
│       ├── main.py
│       ├── report_generator.py
│       ├── kpi_calculator.py
│       ├── templates/
│       │   └── template.pptx
│       ├── tests/
│       └── README.md
├── config/
│   ├── circuitos.json (v1.0, versioned)
│   ├── umbrales.json
│   ├── reglas_aceite.json
│   └── api_spec.yaml
├── data/
│   ├── sample_events_lpr.json
│   ├── sample_movimientos.xlsx
│   └── golden_dataset/
│       ├── circuitos_aceite_30_casos.json
│       └── expected_results.json
├── docs/
│   ├── ARQUITECTURA.md (este documento)
│   ├── API_SPEC.md
│   ├── SOP.md
│   ├── TROUBLESHOOTING.md
│   └── CHANGELOG.md
├── tests/
│   ├── integration_tests.py
│   ├── regression_tests.py
│   └── fixtures/
├── output/
│   ├── reportes/
│   ├── logs/
│   └── audit_trail/
├── .gitignore
├── .env.example
├── README.md
└── requirements.txt (o setup.py)
```

---

## APÉNDICE B: Matriz de Comunicación entre Agentes

```
┌──────────────┬──────────────────┬──────────────────────────┐
│ Agente Origen│ Agente Destino   │ Mensaje / Datos          │
├──────────────┼──────────────────┼──────────────────────────┤
│ Orquestador  │ Infraestructura  │ {fecha_desde, fecha_hasta│
│              │                  │  plantas, umbrales}      │
├──────────────┼──────────────────┼──────────────────────────┤
│ Infraestruc. │ Orquestador      │ {status, eventos_proces.,│
│              │                  │  eventos_cuarentena,     │
│              │                  │  calidad_por_planta}     │
├──────────────┼──────────────────┼──────────────────────────┤
│ Orquestador  │ Circuitos        │ {eventos_file,           │
│              │                  │  movimientos_file}       │
├──────────────┼──────────────────┼──────────────────────────┤
│ Circuitos    │ Orquestador      │ {status, trazas_clasif., │
│              │                  │  válidas, inválidas}     │
├──────────────┼──────────────────┼──────────────────────────┤
│ Orquestador  │ Datos-Trazab.    │ {eventos_file,           │
│              │                  │  movimientos_file}       │
├──────────────┼──────────────────┼──────────────────────────┤
│ Datos-Trazab.│ Orquestador      │ {status, trazas_constr., │
│              │                  │  anomalías_detectadas}   │
├──────────────┼──────────────────┼──────────────────────────┤
│ Orquestador  │ Análisis Exec.   │ {infraestr_output,       │
│              │                  │  circuitos_output,       │
│              │                  │  datos_output}           │
├──────────────┼──────────────────┼──────────────────────────┤
│ Análisis Exec│ Orquestador      │ {status, kpis,           │
│              │                  │  pptx_file}              │
└──────────────┴──────────────────┴──────────────────────────┘
```

---

## APÉNDICE C: Checklist de Deployment

**Antes de Go-Live (Sprint 8)**

**Infraestructura:**
- [ ] Credenciales de acceso seguras (secretos manager).
- [ ] Permisos configurados (quién puede ejecutar, quién puede ver logs, quién puede cambiar config).
- [ ] Backup de datos configurado.
- [ ] Monitoreo alertas configuradas.

**Código:**
- [ ] Todos los tests pasan (unit + integration + regression).
- [ ] Cobertura > 80%.
- [ ] Code review completado.
- [ ] Documentación de código actualizada.
- [ ] Versión del código taggead (v1.0.0).

**Datos:**
- [ ] Definiciones de circuitos versionadas (v1.0 en Git).
- [ ] Golden dataset validado (200+ casos).
- [ ] Histórico limpio (no hay duplicados, no hay nulos donde no deben estar).

**Operacional:**
- [ ] SOP documentada.
- [ ] Runbook de troubleshooting completado.
- [ ] Comité capacitado (attendance checklist).
- [ ] Operaciones capacitadas (attendance checklist).
- [ ] Escalation path claro (quién contactar si falla).

**Validación:**
- [ ] Validación cruzada 100% pasada (agentes vs. manual).
- [ ] Comité sign-off obtenido.
- [ ] 3 reportes "dry-run" generados y revisados sin problemas.

---

## CONCLUSIÓN

Este plan proporciona una hoja de ruta clara para migrar el sistema de trazabilidad de Vicentin a una arquitectura de agentes orquestados. El enfoque es pragmático: agentes grandes por responsabilidad (no pequeños por función), énfasis en auditoría y validación, y ciclo iterativo que valida con stakeholders antes de ir a producción.

**Próximos pasos**: Ejecutar Sprint 0, finalizar repositorio Git y plan de trabajo detallado.

