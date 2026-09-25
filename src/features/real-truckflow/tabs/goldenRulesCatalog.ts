/**
 * Catálogo legible de las reglas de anomalía: `anomaly_kind_reason` persistido → código y ficha.
 *
 * Vive fuera de `SeguridadTab` para que el panel /seguridad y el informe diario (Node, sin
 * React) usen exactamente los mismos códigos y títulos.
 */
/**
 * Reglas de anomalía vigentes (R1, R2, R4, R5, R6, R9, R11, R12; ver `goldenAnomalyRules.ts`): código interno de
 * `anomaly_kind_reason` → ficha legible. Son las ÚNICAS que definen anomalía de comportamiento.
 * R3 fue retirada (2026-09-04) y R2 redefinida (retorno SL→Ric < 2 h): sus tags en corridas
 * viejas caen al grupo `stale`, que el panel muestra aparte porque NO son incumplimientos.
 * R9/R11 se agregaron el 2026-09-09 y son las de evidencia más fuerte (ver cabecera de
 * `goldenAnomalyRules.ts`): visita relámpago al puerto y descarga en una calle distinta a la
 * declarada en el Excel.
 *
 * Cada ficha tiene tres partes para que quede claro CUÁNDO se incumple:
 *  - `observes`   → qué mira la regla.
 *  - `breachedWhen` → la condición exacta (umbral) que la considera incumplida.
 *  - `why`        → por qué ese comportamiento es sospechoso.
 * `desc` queda como resumen de una línea para las tarjetas de la lista.
 */
export type GoldenRule = {
  reason: string
  code: string
  title: string
  desc: string
  observes: string
  breachedWhen: string
  why: string
}
export const GOLDEN_RULES: GoldenRule[] = [
  {
    reason: 'RIC_REINGRESO_RAPIDO_NO_PELLET',
    code: 'R1',
    title: 'Reingreso rápido a Ricardone',
    desc: 'Salió de Ricardone y volvió a entrar en ≤ 1 h (circuito no pellet).',
    observes: 'Los egresos y reingresos de la misma patente a la planta de Ricardone.',
    breachedWhen: 'Vuelve a ingresar a Ricardone en menos de 1 h desde que egresó (circuitos no pellet).',
    why: 'En menos de una hora no llega a completar un viaje real: sugiere que no descargó/cargó donde debía o dio una vuelta corta sin justificar.',
  },
  {
    reason: 'SL_LUEGO_RIC_RETORNO_2H_NO_PELLET',
    code: 'R2',
    title: 'Vuelven a Ricardone desde San Lorenzo',
    desc: 'Estuvieron en San Lorenzo y volvieron a Ricardone en menos de 2 h (no pellet).',
    observes: 'El paso de la patente por San Lorenzo y su retorno a Ricardone (cualquier evento de cámara).',
    breachedWhen: 'Vuelve a Ricardone en menos de 2 h desde su último registro en San Lorenzo. Robusto a fallo de cámara: cuenta cualquier evento en Ricardone (ingreso, preingreso, calada…).',
    why: 'Ir al puerto y volver a la planta en menos de 2 h no encaja con un viaje normal; suele ser un error de destino o un paso por el puerto sin operar.',
  },
  {
    reason: 'RUTA_BALANZA_PLAYA_C16_BALANZA',
    code: 'R4',
    title: 'Balanza → Playa → Celda 16 → Balanza',
    desc: 'Ruta interna balanza ingreso → playa 3 → celda 16 → balanza.',
    observes: 'La secuencia de cámaras internas de Ricardone dentro de un mismo recorrido.',
    breachedWhen: 'Recorre balanza de ingreso → playa 3 → celda 16 → (playa 3) → balanza de salida.',
    why: 'Es un movimiento de mercadería entre celda y playa sin salir de planta; puede encubrir reprocesos o movimientos no declarados.',
  },
  {
    reason: 'CARGA_LUEGO_DESCARGA',
    code: 'R5',
    title: 'Carga y luego descarga',
    desc: 'Pasó por un punto de carga y luego por una plataforma de descarga.',
    observes: 'Puntos de carga (celda 16, S7, S8) y de descarga (volcable, celda 16, San Lorenzo) del recorrido.',
    breachedWhen: 'En el mismo recorrido pasa primero por un punto de carga y después por una plataforma de descarga.',
    why: 'Cargar y descargar en un mismo viaje no corresponde a un circuito normal; puede indicar mercadería que entra y sale sin control.',
  },
  {
    reason: 'VOLCABLE_SIN_CALADA_RIC',
    code: 'R12',
    title: 'Descargó en Ricardone sin calado en cámara ni en Excel',
    desc: 'Descargó en el volcable de Ricardone y ninguna de las dos fuentes registra la hora de calado.',
    observes: 'La visita a Ricardone que termina en descarga por VOLCABLE, la cámara `RicCal*` y la hora de calado que el operario de balanza escribe en el Excel de Movimientos por Contrato.',
    breachedWhen: 'La cámara no registra CALADA en esa visita Y el Excel del movimiento tampoco trae `external_calado_at` dentro de la ventana del viaje.',
    why: 'La cámara `RicCal*` se equivoca a menudo (verificado 2026-09-10: patente confundida con la marca del camión, caracteres mal leídos, luces altas). Por eso se exige que TAMBIÉN falte el registro del operario en el Excel — dos fuentes independientes callando sobre el mismo camión es lo que sostiene la sospecha.',
  },
  {
    reason: 'OBSERVACION_MANUAL',
    code: 'M',
    title: 'Revisión manual',
    desc: 'Patente marcada manualmente para revisión en el comité. Sin regla automática aplicada.',
    observes: 'El recorrido completo del camión durante el rango seleccionado.',
    breachedWhen: 'La patente fue seleccionada manualmente para inspección visual del recorrido, sin evaluación automática.',
    why: 'Comportamiento notado en revisión ad-hoc que amerita mirarlo con las cámaras del DSS y decidir en el comité.',
  },
  {
    reason: 'PLATAFORMA_MULTIPLE_CALLES',
    code: 'R11-b',
    title: 'Descargó en más de una calle del volcable',
    desc: 'La cámara registró descargas en dos o más calles del volcable de puerto sobre el mismo movimiento.',
    observes: 'Los eventos de las cámaras SLZVolcableC1–5 dentro de la ventana temporal del movimiento del Excel.',
    breachedWhen: 'La misma patente activa dos o más cámaras de calles distintas separadas por más de 20 min (para descartar cámaras contiguas leyendo al mismo camión).',
    why: 'Un movimiento se corresponde con una descarga en una sola calle. Dos calles distintas activadas sobre el mismo contrato son dos detecciones positivas independientes — no puede explicarse por falta de cobertura y sugiere que el camión se movió entre calles.',
  },
  {
    reason: 'PLATAFORMA_DISTINTA_A_DECLARADA',
    code: 'R11',
    title: 'Descargó en una calle distinta a la declarada',
    desc: 'El Excel declara un volcable de puerto y la cámara lo registró en otro.',
    observes: 'La plataforma declarada en Movimientos por Contrato contra la calle del volcable que registró la cámara (SLZVolcableC1–5).',
    breachedWhen: 'El movimiento declara VOLCABLE PTO n y ninguna de las calles que registró la cámara dentro de la ventana del movimiento es esa. Los movimientos «de la vuelta» quedan excluidos.',
    why: 'Son dos fuentes independientes que se contradicen: la mercadería no terminó donde el papel dice que terminó. Una cámara caída produce silencio, nunca una contradicción, así que el caso no se explica por falta de cobertura.',
  },
  {
    reason: 'SL_VISITA_RELAMPAGO_SIN_OPERAR',
    code: 'R9',
    title: 'Visita relámpago al puerto',
    desc: 'Entró y salió de San Lorenzo en menos de 30 min sin registro de operación.',
    observes: 'El tiempo entre el ingreso y el egreso del puerto, y si en el medio hubo balanza, volcable, descarga o calado.',
    breachedWhen: 'Sale del puerto en menos de 30 minutos sin ningún registro de operación, cuando la permanencia más corta habitual son 40 minutos.',
    why: 'En media hora no entra la cola de balanza ni una descarga: el camión pasó por el puerto sin operar. Los dos extremos son detecciones reales, así que no es un problema de cobertura de cámaras.',
  },
  {
    reason: 'RIC_SL_MAS30M_SIN_CALADA_SL',
    code: 'R6',
    title: 'Ricardone → San Lorenzo sin calado',
    desc: 'Egreso Ricardone → ingreso San Lorenzo > 30 min (≤ 2 h) sin pasar por calado en San Lorenzo.',
    observes: 'El tramo entre el egreso de Ricardone y el ingreso a San Lorenzo, y si pasa por el calado (muestreo) de SL.',
    breachedWhen: 'Ingresa a San Lorenzo entre 30 min y 2 h después de egresar de Ricardone y NO pasa por el calado de SL en esa visita.',
    why: 'Descargar en el puerto sin pasar por el muestreo de calado saltea un control de calidad obligatorio del circuito.',
  },
]
export const GOLDEN_BY_REASON = new Map(GOLDEN_RULES.map((r) => [r.reason, r]))

/**
 * Subgrupos de R2 (dentro de la regla R2, ver `goldenAnomalyRules.ts`): sub-motivo persistido
 * → etiqueta. La asignación se hace en el pipeline con prioridad b → c → a; acá se muestran
 * en orden a → b → c. Cada camión de R2 trae EXACTAMENTE uno de estos `anomalyKindReason`.
 */
export const R2_RULE_REASON = 'SL_LUEGO_RIC_RETORNO_2H_NO_PELLET'
export const R2_SUBGROUPS: { reason: string; code: string; title: string; desc: string }[] = [
  {
    reason: 'SL_RIC_2H_ERROR_DESTINO_NO_PELLET',
    code: 'R2-a',
    title: 'Error de destino',
    desc: 'San Lorenzo fue su primer destino: fueron al puerto ANTES de pasar por Ricardone. No había actividad previa en la planta.',
  },
  {
    reason: 'SL_RIC_2H_CICLO_COMPLETO_NO_PELLET',
    code: 'R2-b',
    title: 'Volvieron y completaron circuito',
    desc: 'Volvieron a Ricardone y el viaje de retorno completó un circuito reconocido (R7 u otro). Típicamente shuttle Ric↔SL.',
  },
  {
    reason: 'SL_RIC_2H_SIN_CIRCUITO_NO_PELLET',
    code: 'R2-c',
    title: 'Volvieron sin completar circuito',
    desc: 'Volvieron del puerto a Ricardone en menos de 2 h sin completar un circuito reconocido (paso por el puerto sin operar de verdad).',
  },
]
export const R2_SUBGROUP_BY_REASON = new Map(R2_SUBGROUPS.map((s) => [s.reason, s]))
/** Sub-motivo de R2 → motivo de la regla padre (R2) para agrupar; el resto es identidad. */
export function parentRuleReason(reason: string): string {
  return R2_SUBGROUP_BY_REASON.has(reason) ? R2_RULE_REASON : reason
}
