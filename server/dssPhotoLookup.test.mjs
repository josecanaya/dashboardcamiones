import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDssPhotoLookup } from './dssPhotoLookup.mjs'

test('archiva las fotos vistas al decidir y registra las que fallan (EV-40)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'id-evidence-'))
  try {
    const dss = { findVehicleCapture: async () => null, isDssConfigured: () => true, fetchPicture: async (url) => {
      if (url.includes('roto')) throw new Error('404')
      return { type: 'image/jpeg', buf: Buffer.from('jpg') }
    } }
    const b64 = (s) => Buffer.from(s).toString('base64url')
    const { archiveEvidence } = createDssPhotoLookup({ dss })
    const { dir, saved } = await archiveEvidence(root, { site: 'ricardone', fragmentKey: 'f/1', opId: 'op-1', decision: { action: 'confirm', plate: 'AB123CD' }, photos: { captura: { sceneFile: b64('http://dss/a.jpg'), plateFile: b64('http://dss/roto.jpg') } } })
    assert.equal(saved.captura.sceneFile, 'captura-escena.jpg')
    assert.equal(saved.captura.plateFileError, '404')
    assert.ok(fs.existsSync(path.join(dir, 'captura-escena.jpg')))
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    assert.equal(manifest.decision.plate, 'AB123CD')
    assert.ok(dir.startsWith(root) && !dir.includes('f/1'))
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
