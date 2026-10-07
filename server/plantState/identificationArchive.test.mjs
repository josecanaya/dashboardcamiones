import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createIdentificationArchive } from './identificationArchive.mjs'

test('pending candidates survive buffer expiration and restart; decisions can be reopened', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identification-archive-'))
  try {
    const file = path.join(root, 'archive.json')
    const archive = createIdentificationArchive(file)
    const item = { fragmentKey: 'capture-1', at: '2026-10-06T12:00:00Z', level: 'provisorio', readPlate: 'AB123CO', validFormat: true, candidates: [{ plate: 'AB123CD' }] }
    archive.merge('ricardone', [item])
    const restarted = createIdentificationArchive(file)
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
    const archive = createIdentificationArchive(path.join(root, 'archive.json'))
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
