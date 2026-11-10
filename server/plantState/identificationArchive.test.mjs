import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createIdentificationArchive } from './identificationArchive.mjs'

/** Los casos de prueba son de octubre: sin pasarlos al histórico. */
const SIN_PODA = { activeDays: 0 }

test('pending candidates survive buffer expiration and restart; decisions can be reopened', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identification-archive-'))
  try {
    const file = path.join(root, 'archive.json')
    const archive = createIdentificationArchive(file, SIN_PODA)
    const item = { fragmentKey: 'capture-1', at: '2026-10-06T12:00:00Z', level: 'provisorio', readPlate: 'AB123CO', validFormat: true, candidates: [{ plate: 'AB123CD' }] }
    archive.merge('ricardone', [item])
    archive.flush()
    const restarted = createIdentificationArchive(file, SIN_PODA)
    const [pending] = restarted.merge('ricardone', [])
    assert.equal(pending.archived, true)
    assert.deepEqual(pending.candidates, item.candidates)
    const [confirmed] = restarted.merge('ricardone', [], { 'capture-1': { action: 'confirm', plate: 'AB123CD' } })
    assert.equal(confirmed.level, 'confirmado')
    assert.equal(confirmed.assignedPlate, 'AB123CD')
    const [reopened] = restarted.merge('ricardone', [])
    assert.equal(reopened.level, 'provisorio')
    assert.equal(reopened.assignedPlate, null)
    assert.equal(restarted.merge('san_lorenzo', []).length, 0)
    const [conflict] = restarted.merge('ricardone', [item], { 'capture-1': { action: 'confirm', plate: 'AB123CD' } })
    assert.equal(conflict.level, 'provisorio', 'live recognizer conflict must remain reviewable')
    assert.equal(conflict.archived, false)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('a reopened automatic assignment stays in human review (EV-23)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identification-archive-'))
  try {
    const archive = createIdentificationArchive(path.join(root, 'archive.json'), SIN_PODA)
    const item = { fragmentKey: 'auto-1', at: '2026-10-06T12:00:00Z', level: 'casi_seguro', readPlate: 'AB123CO', assignedPlate: 'AB123CD', validFormat: true, candidates: [{ plate: 'AB123CD' }] }
    archive.merge('ricardone', [item])
    const [auto] = archive.merge('ricardone', [])
    assert.equal(auto.level, 'casi_seguro')
    const [review] = archive.merge('ricardone', [], { 'auto-1': { action: 'review', updatedAt: '2026-10-06T13:00:00Z' } })
    assert.equal(review.level, 'provisorio')
    assert.equal(review.assignedPlate, null)
    const [deferred] = archive.merge('ricardone', [], { 'auto-1': { action: 'defer', reason: 'foto ilegible' } })
    assert.equal(deferred.level, 'provisorio')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('si el archivo quedó vacío, arranca de la copia .bak', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archivo-'))
  const file = path.join(dir, 'archive.json')
  fs.writeFileSync(file, '')
  fs.writeFileSync(`${file}.bak`, JSON.stringify({ ricardone: { f1: { fragmentKey: 'f1', at: '2026-10-29T10:00:00Z', level: 'pendiente', originalLevel: 'pendiente', candidates: [] } } }))
  const archive = createIdentificationArchive(file, SIN_PODA)
  assert.deepEqual(archive.merge('ricardone', []).map((i) => i.fragmentKey), ['f1'])
})

test('los casos de más de activeDays días pasan al histórico y dejan de volver en merge', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archivo-'))
  try {
    const file = path.join(dir, 'archive.json')
    const viejo = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const nuevo = new Date(Date.now() - 3600_000).toISOString()
    fs.writeFileSync(file, JSON.stringify({ ricardone: {
      v: { fragmentKey: 'v', at: viejo, level: 'pendiente', originalLevel: 'pendiente', candidates: [] },
      n: { fragmentKey: 'n', at: nuevo, level: 'pendiente', originalLevel: 'pendiente', candidates: [] },
    } }))
    const archive = createIdentificationArchive(file, { activeDays: 7 })
    assert.deepEqual(archive.merge('ricardone', []).map((i) => i.fragmentKey), ['n'])
    const hist = JSON.parse(fs.readFileSync(path.join(dir, 'archive-historico.json'), 'utf8'))
    assert.deepEqual(Object.keys(hist.ricardone), ['v'])
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).ricardone), ['n'])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
