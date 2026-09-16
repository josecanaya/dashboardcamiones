import { describe, expect, it } from 'vitest'
import { preparationReducer } from './preparationReducer'
import { INITIAL_PREPARATION_STATE, type PreparationState } from './types'

const withDraft = (state: PreparationState, from: string, to: string): PreparationState =>
  preparationReducer(state, { type: 'SET_DRAFT', draft: { from, to } })

describe('preparationReducer', () => {
  it('SET_DRAFT sólo cambia draft, no requested/active', () => {
    const before: PreparationState = {
      ...INITIAL_PREPARATION_STATE,
      requested: { from: '2026-01-01', to: '2026-01-07' },
      active: { from: '2026-01-01', to: '2026-01-07' },
    }
    const after = preparationReducer(before, { type: 'SET_DRAFT', draft: { from: '2026-02-01', to: '2026-02-07' } })
    expect(after.draft).toEqual({ from: '2026-02-01', to: '2026-02-07' })
    expect(after.requested).toEqual(before.requested)
    expect(after.active).toEqual(before.active)
  })

  it('CHECK_STARTED saca foto de requested desde draft e incrementa operationId', () => {
    const draftState = withDraft(INITIAL_PREPARATION_STATE, '2026-03-01', '2026-03-07')
    const after = preparationReducer(draftState, { type: 'CHECK_STARTED' })
    expect(after.phase).toBe('checking')
    expect(after.operationId).toBe(1)
    expect(after.requested).toEqual({ from: '2026-03-01', to: '2026-03-07' })
  })

  it('STEP_STARTED con operationId viejo deja el estado inalterado', () => {
    const checking = preparationReducer(withDraft(INITIAL_PREPARATION_STATE, '2026-03-01', '2026-03-07'), {
      type: 'CHECK_STARTED',
    })
    const checked = preparationReducer(checking, {
      type: 'CHECK_SUCCEEDED',
      operationId: 1,
      sourceDays: [],
      missingExcelDays: [],
      steps: [{ key: 'download:2026-03-01', kind: 'download', from: '2026-03-01', to: '2026-03-01' }],
      limitations: [],
    })
    const stale = preparationReducer(checked, { type: 'STEP_STARTED', operationId: 0, key: 'download:2026-03-01' })
    expect(stale).toEqual(checked)
  })

  it('STEP_SUCCEEDED con operationId actual marca el paso done', () => {
    const checking = preparationReducer(withDraft(INITIAL_PREPARATION_STATE, '2026-03-01', '2026-03-07'), {
      type: 'CHECK_STARTED',
    })
    const checked = preparationReducer(checking, {
      type: 'CHECK_SUCCEEDED',
      operationId: 1,
      sourceDays: [],
      missingExcelDays: [],
      steps: [{ key: 'download:2026-03-01', kind: 'download', from: '2026-03-01', to: '2026-03-01' }],
      limitations: [],
    })
    const started = preparationReducer(checked, { type: 'STEP_STARTED', operationId: 1, key: 'download:2026-03-01' })
    const done = preparationReducer(started, { type: 'STEP_SUCCEEDED', operationId: 1, key: 'download:2026-03-01' })
    expect(done.steps[0].state).toBe('done')
  })

  it('LOAD_SUCCEEDED es la única acción que cambia active', () => {
    const checking = preparationReducer(withDraft(INITIAL_PREPARATION_STATE, '2026-03-01', '2026-03-07'), {
      type: 'CHECK_STARTED',
    })
    const checked = preparationReducer(checking, {
      type: 'CHECK_SUCCEEDED',
      operationId: 1,
      sourceDays: [],
      missingExcelDays: [],
      steps: [{ key: 'load:2026-03-01:2026-03-07', kind: 'load', from: '2026-03-01', to: '2026-03-07' }],
      limitations: [],
    })
    // Ningún otro evento cambia active.
    const started = preparationReducer(checked, { type: 'STEP_STARTED', operationId: 1, key: 'load:2026-03-01:2026-03-07' })
    expect(started.active).toBeNull()
    const succeeded = preparationReducer(started, {
      type: 'STEP_SUCCEEDED',
      operationId: 1,
      key: 'load:2026-03-01:2026-03-07',
    })
    expect(succeeded.active).toBeNull()

    const loaded = preparationReducer(succeeded, {
      type: 'LOAD_SUCCEEDED',
      operationId: 1,
      range: { from: '2026-03-01', to: '2026-03-07' },
    })
    expect(loaded.active).toEqual({ from: '2026-03-01', to: '2026-03-07' })
    expect(loaded.phase).toBe('ready')
  })

  it('STEP_FAILED con paso running deja el estado failed y preserva active previo', () => {
    const base: PreparationState = {
      ...INITIAL_PREPARATION_STATE,
      operationId: 1,
      requested: { from: '2026-03-01', to: '2026-03-07' },
      active: { from: '2026-02-01', to: '2026-02-07' },
      steps: [
        { key: 'download:2026-03-01', kind: 'download', from: '2026-03-01', to: '2026-03-01', state: 'running', error: null },
      ],
      phase: 'downloading',
    }
    const failed = preparationReducer(base, {
      type: 'STEP_FAILED',
      operationId: 1,
      key: 'download:2026-03-01',
      error: 'HTTP 500',
    })
    expect(failed.phase).toBe('failed')
    expect(failed.steps[0].state).toBe('failed')
    expect(failed.steps[0].error).toBe('HTTP 500')
    expect(failed.active).toEqual({ from: '2026-02-01', to: '2026-02-07' })
  })

  it('STOPPED pasa a interrupted', () => {
    const base: PreparationState = { ...INITIAL_PREPARATION_STATE, phase: 'downloading', operationId: 3 }
    const stopped = preparationReducer(base, { type: 'STOPPED' })
    expect(stopped.phase).toBe('interrupted')
  })

  it('RESTORED con fase activa persistida la convierte a interrupted', () => {
    const restored = preparationReducer(INITIAL_PREPARATION_STATE, {
      type: 'RESTORED',
      draft: { from: '2026-03-01', to: '2026-03-07' },
      requested: { from: '2026-03-01', to: '2026-03-07' },
      phase: 'processing',
    })
    expect(restored.phase).toBe('interrupted')
    expect(restored.draft).toEqual({ from: '2026-03-01', to: '2026-03-07' })
    expect(restored.active).toBeNull()
  })

  it('RESTORED con fase terminal persistida la conserva', () => {
    const restored = preparationReducer(INITIAL_PREPARATION_STATE, {
      type: 'RESTORED',
      draft: { from: '2026-03-01', to: '2026-03-07' },
      requested: null,
      phase: 'ready',
    })
    expect(restored.phase).toBe('ready')
  })
})
