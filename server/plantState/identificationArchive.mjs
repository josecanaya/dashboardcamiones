import fs from 'node:fs'
import path from 'node:path'

/**
 * Retains original candidates independently of the rolling camera buffer.
 *
 * Solo quedan activos los casos de los últimos IDENTIFICATION_ARCHIVE_DAYS días (7 por defecto): los más viejos
 * pasan a `<archivo>-historico.json` (nada se borra) y dejan de entrar en cada vuelta del reconocedor. Hasta el
 * 10/11 el archivo llegó a 125 MB / 21 mil casos desde el 06/10 y cada vuelta lo reescribía entero (disco al
 * 100 %, 5–34 s bloqueado por planta). La escritura se agrupa: como mucho una vez por minuto, y al cerrar.
 */
export function createIdentificationArchive(file, { activeDays = Number(process.env.IDENTIFICATION_ARCHIVE_DAYS ?? 7), writeEveryMs = 60_000 } = {}) {
  const backup = `${file}.bak`
  const historico = file.replace(/\.json$/, '') + '-historico.json'
  /** null si no existe; lanza si está vacío o roto. */
  const read = (f) => {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }
  let store = {}
  // El 29/10 el archivo apareció vacío y el servidor no arrancaba: si está roto, se usa la copia.
  try {
    store = read(file) ?? read(backup) ?? {}
  } catch (error) {
    console.warn(`[identificación] ${file} está vacío o roto (${error instanceof Error ? error.message : error}); uso la copia ${backup}`)
    try { store = read(backup) ?? {} } catch { store = {} }
  }

  let lastBackupMs = 0
  let dirty = false
  let writeTimer = null
  function writeNow() {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null }
    if (!dirty) return
    dirty = false
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(store))
    // Copia de la versión anterior (cada 10 min, solo si es válida): si el archivo se rompe, se arranca de ahí.
    if (Date.now() - lastBackupMs > 10 * 60_000) {
      try {
        if (fs.statSync(file).size > 2) {
          fs.copyFileSync(file, backup)
          lastBackupMs = Date.now()
        }
      } catch {}
    }
    fs.renameSync(temporary, file)
  }
  function scheduleWrite() {
    dirty = true
    if (writeTimer) return
    writeTimer = setTimeout(() => { writeTimer = null; try { writeNow() } catch (e) { console.warn('[identificación] no se pudo guardar el archivo:', e instanceof Error ? e.message : e) } }, writeEveryMs)
    writeTimer.unref?.()
  }
  process.once('exit', () => { try { writeNow() } catch {} })

  /** Pasa al histórico los casos de más de `activeDays` días. Corre al arrancar y una vez por hora. */
  let lastPruneMs = 0
  function prune(nowMs = Date.now()) {
    lastPruneMs = nowMs
    if (!(activeDays > 0)) return
    const cut = new Date(nowMs - activeDays * 86_400_000).toISOString()
    const viejos = {}
    let n = 0
    for (const [site, items] of Object.entries(store)) {
      for (const [k, it] of Object.entries(items)) {
        if (String(it?.at ?? '') >= cut) continue
        ;(viejos[site] ||= {})[k] = it
        delete items[k]
        n++
      }
    }
    if (!n) return
    let hist = {}
    try { hist = read(historico) ?? {} } catch { hist = {} }
    for (const [site, items] of Object.entries(viejos)) Object.assign((hist[site] ||= {}), items)
    fs.writeFileSync(`${historico}.tmp`, JSON.stringify(hist))
    fs.renameSync(`${historico}.tmp`, historico)
    dirty = true
    writeNow()
    console.log(`[identificación] ${n} casos de más de ${activeDays} días pasaron a ${path.basename(historico)}`)
  }
  try { prune() } catch (e) { console.warn('[identificación] no se pudo pasar al histórico:', e instanceof Error ? e.message : e) }

  function merge(site, current, decisions = {}) {
    if (Date.now() - lastPruneMs > 3600_000) {
      try { prune() } catch (e) { console.warn('[identificación] no se pudo pasar al histórico:', e instanceof Error ? e.message : e) }
    }
    store[site] ||= {}
    let changed = false
    for (const item of current) {
      const previous = store[site][item.fragmentKey]
      const originalLevel = ['confirmado', 'rechazado'].includes(item.level) ? (item.validFormat || item.candidates.length ? 'provisorio' : 'pendiente') : item.level
      const value = { ...item, originalLevel: previous?.originalLevel ?? originalLevel }
      if (JSON.stringify(previous) !== JSON.stringify(value)) {
        store[site][item.fragmentKey] = value
        changed = true
      }
    }
    if (changed) scheduleWrite()
    const live = new Map(current.map(item => [item.fragmentKey, item]))
    return Object.values(store[site]).map(saved => {
      // Keep conflict resolution from the recognizer for captures still in its buffer.
      if (live.has(saved.fragmentKey)) return { ...live.get(saved.fragmentKey), archived: false }
      const item = { ...saved, archived: true }
      const decision = decisions[item.fragmentKey]
      if (decision?.action === 'confirm') return { ...item, decision, level: 'confirmado', assignedPlate: decision.plate }
      if (decision?.action === 'reject') return { ...item, decision, level: 'rechazado', assignedPlate: null }
      if (decision?.action === 'review' || decision?.action === 'defer') return { ...item, decision, level: item.originalLevel === 'casi_seguro' ? (item.candidates.length ? 'provisorio' : 'pendiente') : item.originalLevel, assignedPlate: null }
      if (decision?.action === 'note') return { ...item, decision, level: item.originalLevel, assignedPlate: item.originalLevel === 'casi_seguro' ? item.assignedPlate : null }
      return { ...item, decision: null, level: item.originalLevel, assignedPlate: item.originalLevel === 'casi_seguro' ? item.assignedPlate : null }
    }).sort((a, b) => b.at.localeCompare(a.at))
  }
  return { merge, flush: writeNow }
}
