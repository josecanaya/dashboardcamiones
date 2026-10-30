/**
 * Capas del reconocedor de patentes, para ver de un vistazo que cada una esté decidiendo.
 * Cada regla del reconocedor (plateIdentification.mjs y la IA en live/vision/seenPlate.mjs) pertenece a una capa;
 * la decisión de operaciones manda sobre la regla.
 */
export const LAYERS = [
  { key: 'lote', label: 'Lote (cámaras)', rules: ['doble_lectura', 'universo', 'cuenta', 'atributos_dss', 'busqueda_atras', 'par_trasera'] },
  { key: 'capa2', label: 'Carta / Permitidos', rules: ['carta_porte', 'vehiculo_permitido', 'acoplado_carta', 'acoplado_permitido', 'doble_lectura_carta', 'doble_lectura_permitido', 'carta_parecida'] },
  { key: 'balanza', label: 'Balanza (SGC)', rules: ['leida_bien_balanza', 'doble_lectura_balanza', 'balanza_parecida', 'balanza_unica', 'acoplado_balanza'] },
  { key: 'aprendizaje', label: 'Aprendizaje', rules: ['corregida_antes', 'confirmada_antes', 'no_camion'] },
  { key: 'ia', label: 'IA por imagen', rules: ['ia_imagen'] },
  { key: 'operador', label: 'Operaciones', rules: [] },
  { key: 'sin_resolver', label: 'Sin resolver', rules: [] },
]
const LAYER_OF_RULE = new Map(LAYERS.flatMap((l) => l.rules.map((r) => [r, l.key])))

/** Capa que decidió un caso del reconocedor; null si no es un caso (lectura buena sin corrección). */
export function layerOf(it) {
  if (!it) return null
  if (it.decision && ['confirmado', 'rechazado'].includes(it.level)) return 'operador'
  if (it.level === 'provisorio' || it.level === 'pendiente') return 'sin_resolver'
  return LAYER_OF_RULE.get(it.rule) ?? null
}

/**
 * Resumen por capa de los casos de las últimas `windowMs`: decisiones aplicadas, casos que dejó por
 * confirmar (su regla propuso pero no alcanzó) y hora de la última decisión.
 * @param {object[]} items casos del reconocedor
 */
export function summarizeLayers(items, nowMs, windowMs = 24 * 3600_000) {
  const out = new Map(LAYERS.map((l) => [l.key, { key: l.key, label: l.label, decided: 0, proposed: 0, rejectedByOps: 0, lastAt: null }]))
  for (const it of items || []) {
    const t = Date.parse(it.at)
    if (!Number.isFinite(t) || t < nowMs - windowMs || t > nowMs) continue
    const key = layerOf(it)
    if (!key) continue
    const row = out.get(key)
    row.decided++
    if (!row.lastAt || it.at > row.lastAt) row.lastAt = it.at
    // Lo que una regla propuso y quedó por confirmar también cuenta como señal de que la capa trabaja.
    const ruleLayer = LAYER_OF_RULE.get(it.rule)
    if (key === 'sin_resolver' && ruleLayer) out.get(ruleLayer).proposed++
    // Operaciones rechazó lo que decidió una regla: error de esa capa.
    if (key === 'operador' && it.level === 'rechazado' && ruleLayer) out.get(ruleLayer).rejectedByOps++
  }
  return [...out.values()]
}
