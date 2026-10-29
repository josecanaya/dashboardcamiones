import fs from 'node:fs'
import path from 'node:path'

/** Retains original candidates independently of the rolling camera buffer. */
export function createIdentificationArchive(file) {
  const backup = `${file}.bak`
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
  function merge(site, current, decisions = {}) {
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
    if (changed) {
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
  return { merge }
}
