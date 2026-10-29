/**
 * Alertas de En vivo: las capturas que atravesaron las capas sin que ninguna las identifique (lámina
 * «Cada lectura atraviesa cuatro capas», Comité de Seguridad):
 *   Capa 2 ¿Quién es?   no figura en Vehículos Permitidos ni en una carta de porte vigente;
 *   Capa 3 Corrección   ni el algoritmo, ni la base histórica corregida, ni la IA por imagen la resolvieron;
 *   → alerta.
 * (La capa 4 —¿puede estar ahí?— sumará sus propias alertas.)
 *
 * Se guardan por día en data/alertas/<día>.json con el paso por cada capa. Si después la resuelve
 * operaciones o la IA, la alerta queda como resuelta (con quién y a qué patente), no se borra.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const OPEN_LEVELS = new Set(['pendiente', 'provisorio'])
const arDay = (iso) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10)
const pct = (x) => `${Math.round((x ?? 0) * 100)} %`

/** ¿La captura terminó en alerta? Abierta tras la corrección, o fuera de todo registro (no la base de no camiones). */
export function isAlert(item) {
  if (item.decision && ['confirm', 'reject'].includes(item.decision.action)) return false
  if (OPEN_LEVELS.has(item.level)) return true
  return item.level === 'fuera_sistema' && item.rule !== 'no_camion'
}

/** Qué dijo cada capa de esta captura, en palabras. */
export function layerTrail(item) {
  const c = item.candidates ?? []
  const best = c[0]
  const ia = item.ia
  return {
    capa2: item.padron?.read
      ? `figura en ${item.padron.read.source === 'permitido' ? 'Vehículos Permitidos' : `la carta de porte ${item.padron.read.ctg}`}`
      : `${item.validFormat ? item.readPlate : 'la lectura'} no figura en Vehículos Permitidos ni en una carta de porte vigente`,
    algoritmo: best
      ? `${c.length} ${c.length === 1 ? 'candidato' : 'candidatos'}; el más parecido, ${best.plate} (${pct(best.similarity)}), no alcanza para decidir`
      : 'ningún camión en planta se parece ni esperaba este paso',
    historica: 'sin una corrección previa de operaciones para esta lectura',
    ia: !ia
      ? 'pendiente: la IA todavía no la miró'
      : ia.skipped
        ? `no pudo mirarla: ${ia.skipped}`
        : `${ia.plate ? `eligió ${ia.plate} (${pct(ia.confidence)})` : 'no la encontró entre los candidatos'}${ia.seenPlate ? `; lee ${ia.seenPlate}${ia.patenteVista?.texto ? ` (${ia.patenteVista.texto.replace(/^la IA lee \S+: /, '')})` : ''}` : ''}${ia.vehicleType ? `; ve un ${ia.vehicleType}` : ''}`,
    motivo: item.reason ?? null,
  }
}

export function createAlertStore({ projectRoot, log = console }) {
  const dir = path.join(projectRoot, 'data', 'alertas')
  /** @type {Map<string, Map<string, object>>} día → clave (planta|fragmento) → alerta */
  const days = new Map()
  const dirty = new Set()

  const fileOf = (day) => path.join(dir, `${day}.json`)
  function dayMap(day) {
    let m = days.get(day)
    if (!m) {
      m = new Map()
      try {
        if (existsSync(fileOf(day))) for (const a of JSON.parse(readFileSync(fileOf(day), 'utf8')).alertas ?? []) m.set(`${a.site}|${a.fragmentKey}`, a)
      } catch (e) {
        log.warn?.(`[alertas] no se pudo leer ${day}: ${e instanceof Error ? e.message : e}`)
      }
      days.set(day, m)
    }
    return m
  }
  function flush() {
    if (!dirty.size) return
    mkdirSync(dir, { recursive: true })
    for (const day of dirty) {
      const out = fileOf(day)
      writeFileSync(`${out}.tmp`, JSON.stringify({ day, alertas: [...dayMap(day).values()] }, null, 1))
      renameSync(`${out}.tmp`, out)
    }
    dirty.clear()
  }

  /**
   * Pasa los casos del reconocedor de una planta: abre las alertas nuevas, actualiza su paso por las
   * capas y cierra las que ya se resolvieron.
   */
  function update(site, items, nowIso = new Date().toISOString()) {
    let opened = 0
    for (const it of items) {
      const day = arDay(it.at)
      const m = dayMap(day)
      const key = `${site}|${it.fragmentKey}`
      const prev = m.get(key)
      if (isAlert(it)) {
        const a = {
          site,
          fragmentKey: it.fragmentKey,
          readPlate: it.readPlate,
          validFormat: it.validFormat,
          node: it.node,
          nodeLabel: it.nodeLabel,
          deviceCode: it.deviceCode,
          at: it.at,
          level: it.level,
          capas: layerTrail(it),
          /** Los candidatos más parecidos, para que operaciones la resuelva desde la alerta. */
          candidatos: (it.candidates ?? []).slice(0, 4).map((c) => ({ plate: c.plate, similarity: c.similarity ?? null })),
          alertAt: prev?.alertAt ?? nowIso,
          updatedAt: nowIso,
          resolved: null,
        }
        if (!prev) opened++
        if (!prev || prev.resolved || !prev.candidatos || JSON.stringify(prev.capas) !== JSON.stringify(a.capas) || prev.level !== a.level) {
          m.set(key, a)
          dirty.add(day)
        }
      } else if (prev && !prev.resolved) {
        // Ya la identificó alguna capa (o la decidió operaciones): queda como resuelta.
        prev.resolved = {
          at: nowIso,
          by: it.decision ? 'operaciones' : it.rule ?? it.level,
          plate: it.assignedPlate ?? null,
          level: it.level,
        }
        dirty.add(day)
      }
    }
    flush()
    return opened
  }

  /** Alertas de un día (de una planta o de las dos), las más recientes primero. */
  function list(site, day) {
    const all = [...dayMap(day).values()].filter((a) => !site || a.site === site).sort((x, y) => y.at.localeCompare(x.at))
    return { day, open: all.filter((a) => !a.resolved).length, resolved: all.filter((a) => a.resolved).length, alertas: all }
  }

  return { update, list }
}
