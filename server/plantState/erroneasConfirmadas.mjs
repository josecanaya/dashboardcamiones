/**
 * Lectura ilegible (sin formato de patente) que nadie asignó: ¿es lectura errónea confirmada o alerta?
 * (docs/RECONOCEDOR_RECORRIDO_CAPTURA.md, final del recorrido)
 *
 * - Errónea confirmada: la misma cámara leyó un paso guardado dentro de su ventana (el camión sigue frente a la
 *   cámara y lo ilegible es otra cosa del mismo vehículo: carrocería, «HERMANN», la patente a medias), o el
 *   mismo nodo dentro de 60 s (la otra cámara del par frontal/trasera).
 * - Ventana por cámara: 5 min donde el camión se detiene (balanzas, calada, playas, TK400, volcables, carga y
 *   descarga), 60 s en las de paso.
 * - El resto es alerta; varias seguidas en la misma cámara (dentro de su ventana) son una sola alerta.
 * Medido el 03/11: 228 ilegibles sin asignar → 100 confirmadas y 121 alertas.
 */
const PARADA = /Bal|B\d(Ingreso|Egreso)|TK400|Playa|Cal0|Volcable|Carg|Desc/i
const NODO_MS = 60_000

/** Ventana en la que una cámara sigue viendo al mismo camión. */
export const ventanaCamara = (device) => (PARADA.test(String(device ?? '')) ? 5 * 60_000 : 60_000)

/**
 * @param {{ key: string, device: string, node: string|null, site?: string, t: number }[]} erroneas
 * @param {{ device: string, node: string|null, site?: string, t: number }[]} guardados pasos ya identificados
 * @returns {{ confirmadas: Map<string, object>, alertas: { key: string, agrupa: string[] }[] }}
 *   confirmadas: key → paso guardado al que se une; alertas: la primera de cada racimo y las que agrupa.
 */
export function clasificarErroneas(erroneas, guardados) {
  const porCamara = new Map()
  const porNodo = new Map()
  for (const g of guardados) {
    if (!Number.isFinite(g.t)) continue
    ;(porCamara.get(g.device) ?? porCamara.set(g.device, []).get(g.device)).push(g)
    const kn = `${g.site ?? ''}|${g.node}`
    if (g.node) (porNodo.get(kn) ?? porNodo.set(kn, []).get(kn)).push(g)
  }
  const cerca = (lista, t, w) => {
    let best = null
    for (const g of lista ?? []) if (Math.abs(g.t - t) <= w && (!best || Math.abs(g.t - t) < Math.abs(best.t - t))) best = g
    return best
  }
  const confirmadas = new Map()
  const resto = []
  for (const e of erroneas) {
    const g = cerca(porCamara.get(e.device), e.t, ventanaCamara(e.device)) ?? (e.node ? cerca(porNodo.get(`${e.site ?? ''}|${e.node}`), e.t, NODO_MS) : null)
    if (g) confirmadas.set(e.key, g)
    else resto.push(e)
  }
  resto.sort((a, b) => a.t - b.t)
  const alertas = []
  const abierta = new Map()
  for (const e of resto) {
    const a = abierta.get(e.device)
    if (a && e.t - a.ult <= ventanaCamara(e.device)) {
      a.alerta.agrupa.push(e.key)
      a.ult = e.t
    } else {
      const alerta = { key: e.key, agrupa: [] }
      alertas.push(alerta)
      abierta.set(e.device, { alerta, ult: e.t })
    }
  }
  return { confirmadas, alertas }
}
