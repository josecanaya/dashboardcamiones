import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createPlantStateService } from './service.mjs'

/** Servicio aislado: decisiones y log en un directorio temporal (no toca data/ real). */
function isolated() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'id-decisions-'))
  return { root, svc: createPlantStateService({ projectRoot: root, apiBase: 'http://127.0.0.1:9' }) }
}

test('opId idempotente, versión con conflicto y motivo obligatorio (EV-05/06/08)', () => {
  const { root, svc } = isolated()
  try {
    const first = svc.decideIdentification('ricardone', 'f1', { action: 'confirm', plate: 'AB123CD', expectedVersion: null, opId: 'op-1' })
    assert.equal(first.decision.plate, 'AB123CD')
    const replay = svc.decideIdentification('ricardone', 'f1', { action: 'confirm', plate: 'ZZ999ZZ', opId: 'op-1' })
    assert.equal(replay.replayed, true)
    assert.equal(replay.decision.plate, 'AB123CD', 'reintentar el mismo opId no aplica otra cosa')
    assert.deepEqual(svc.getIdentificationOp('op-1').version, first.version)
    assert.throws(() => svc.decideIdentification('ricardone', 'f1', { action: 'reject', reason: 'x', expectedVersion: null }), (e) => e.code === 'version_conflict')
    assert.throws(() => svc.decideIdentification('ricardone', 'f2', { action: 'reject' }), (e) => e.code === 'reason_required')
    assert.throws(() => svc.decideIdentification('ricardone', 'f2', { action: 'defer' }), (e) => e.code === 'reason_required')
    const deferred = svc.decideIdentification('ricardone', 'f2', { action: 'defer', reason: 'foto ilegible' })
    assert.equal(deferred.decision.attempts, 1)
    const log = fs.readFileSync(path.join(root, 'data', 'plate-identification-log.jsonl'), 'utf8').trim().split('\n')
    assert.equal(log.length, 2, 'el replay no se registra dos veces')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('reabrir deja revisión humana y las notas sobreviven a las decisiones (EV-21/23)', () => {
  const { root, svc } = isolated()
  try {
    svc.decideIdentification('ricardone', 'f1', { action: 'note', text: 'llamé a portería', operator: 'Turno A' })
    const confirmed = svc.decideIdentification('ricardone', 'f1', { action: 'confirm', plate: 'AB123CD', attrFlags: ['color', 'otro'] })
    assert.equal(confirmed.decision.notes.length, 1)
    assert.deepEqual(confirmed.decision.attrFlags, ['color'])
    const reopened = svc.decideIdentification('ricardone', 'f1', { action: 'clear', reason: 'patente dudosa' })
    assert.equal(reopened.decision.action, 'review')
    assert.equal(reopened.decision.previous.plate, 'AB123CD')
    assert.equal(reopened.decision.notes.length, 1)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('reserva blanda: otro puesto ve el caso tomado (EV-06)', () => {
  const { root, svc } = isolated()
  try {
    assert.equal(svc.claimIdentification('ricardone', 'f1', { by: 'A', label: 'Puesto A' }).ok, true)
    const other = svc.claimIdentification('ricardone', 'f1', { by: 'B' })
    assert.equal(other.ok, false)
    assert.equal(other.claim.label, 'Puesto A')
    svc.claimIdentification('ricardone', 'f1', { by: 'A', release: true })
    assert.equal(svc.claimIdentification('ricardone', 'f1', { by: 'B' }).ok, true)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
