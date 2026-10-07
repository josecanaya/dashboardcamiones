import fs from 'node:fs'
import path from 'node:path'

/** Retains original candidates independently of the rolling camera buffer. */
export function createIdentificationArchive(file) {
  let store = {}
  try { store = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
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
      return { ...item, decision: null, level: item.originalLevel, assignedPlate: item.originalLevel === 'casi_seguro' ? item.assignedPlate : null }
    }).sort((a, b) => b.at.localeCompare(a.at))
  }
  return { merge }
}
