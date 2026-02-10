import { describe, it, expect } from 'vitest'
import { validateTrip } from './tripValidator'
import type { NormalizedEvent } from '../domain/events'

const SITE = 'ricardone' as const

function ev(
  eventType: NormalizedEvent['eventType'],
  occurredAt: string,
  raw: Record<string, unknown> = {}
): NormalizedEvent {
  return {
    siteId: SITE,
    eventType,
    occurredAt,
    raw,
  }
}

describe('validateTrip', () => {
  describe('caminos válidos — ideal', () => {
    it('ABCDEF con resultado OK → VALID_IDEAL', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:15:00', { resultado: 'aprobado' }),
        ev('DISCHARGE_END', '2024-01-01T08:45:00'),
        ev('SCALE_OUT', '2024-01-01T08:50:00'),
        ev('EXIT', '2024-01-01T08:55:00'),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('VALID_IDEAL')
      expect(r.path).toBe('ABCDEF')
      expect(r.flags).toHaveLength(0)
    })

    it('A,B,C(OK), UNLOAD_START, UNLOAD_END, E, F → VALID_IDEAL, pathKey ABCDEF (D colapsa)', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:15:00', { labResult: 'OK' }),
        ev('DISCHARGE_START', '2024-01-01T08:35:00'),
        ev('DISCHARGE_END', '2024-01-01T08:45:00'),
        ev('SCALE_OUT', '2024-01-01T08:50:00'),
        ev('EXIT', '2024-01-01T08:55:00'),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('VALID_IDEAL')
      expect(r.path).toBe('ABCDEF')
      expect(r.flags).toHaveLength(0)
    })

    it('labResult en fila de SAMPLE_SOLID_TAKEN (sin LAB_RESULT_READY) → VALID_IDEAL, path ABCDEF', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00', { labResult: 'OK' }),
        ev('DISCHARGE_END', '2024-01-01T08:45:00'),
        ev('SCALE_OUT', '2024-01-01T08:50:00'),
        ev('EXIT', '2024-01-01T08:55:00'),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('VALID_IDEAL')
      expect(r.path).toBe('ABCDEF')
      expect(r.flags).toHaveLength(0)
    })
  })

  describe('caminos válidos — aceptables (con espera)', () => {
    it('ABGCDEF con G entre B y C → VALID_ACCEPTABLE', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('YARD_WAIT', '2024-01-01T08:10:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:20:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:25:00', { status: 'APPROVED' }),
        ev('DISCHARGE_END', '2024-01-01T08:55:00'),
        ev('SCALE_OUT', '2024-01-01T09:00:00'),
        ev('EXIT', '2024-01-01T09:05:00'),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('VALID_ACCEPTABLE')
      expect(r.path).toBe('ABGCDEF')
      expect(r.flags).toHaveLength(0)
    })

    it('ABCGDEF con G entre C y D → VALID_ACCEPTABLE', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:15:00', { resultado: 'ok' }),
        ev('YARD_WAIT', '2024-01-01T08:20:00'),
        ev('DISCHARGE_END', '2024-01-01T08:50:00'),
        ev('SCALE_OUT', '2024-01-01T08:55:00'),
        ev('EXIT', '2024-01-01T09:00:00'),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('VALID_ACCEPTABLE')
      expect(r.path).toBe('ABCGDEF')
    })

    it('ABCCDEF con re-calada (2 C) → VALID_ACCEPTABLE', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:12:00', { labResult: 'OBS' }),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:18:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:22:00', { labResult: 'OK' }),
        ev('DISCHARGE_END', '2024-01-01T08:50:00'),
        ev('SCALE_OUT', '2024-01-01T08:55:00'),
        ev('EXIT', '2024-01-01T09:00:00'),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('VALID_ACCEPTABLE')
      expect(r.path).toBe('ABCCDEF')
      expect(r.flags).toHaveLength(0)
    })
  })

  describe('caminos válidos — sin descarga', () => {
    it('ABCF con resultado NO → VALID_NO_DISCHARGE', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:15:00', { resultado: 'rechazado' }),
        ev('EXIT', '2024-01-01T08:20:00'),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('VALID_NO_DISCHARGE')
      expect(r.path).toBe('ABCF')
      expect(r.flags).toHaveLength(0)
    })

    it('ABGCF con G y resultado NO → VALID_NO_DISCHARGE', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('YARD_WAIT', '2024-01-01T08:08:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:12:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:16:00', { status: 'REJECTED' }),
        ev('EXIT', '2024-01-01T08:22:00'),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('VALID_NO_DISCHARGE')
      expect(r.path).toBe('ABGCF')
    })
  })

  describe('caminos inválidos', () => {
    it('sin eventos → INVALID, MISSING_EVENT', () => {
      const r = validateTrip([])
      expect(r.status).toBe('INVALID')
      expect(r.flags).toContain('MISSING_EVENT')
    })

    it('D sin resultado OK (rechazado con descarga) → INVALID, D_WITHOUT_OK', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:15:00', { resultado: 'rechazado' }),
        ev('DISCHARGE_END', '2024-01-01T08:45:00'),
        ev('SCALE_OUT', '2024-01-01T08:50:00'),
        ev('EXIT', '2024-01-01T08:55:00'),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('INVALID')
      expect(r.flags).toContain('D_WITHOUT_OK')
    })

    it('recorrido abierto (sin F) → INVALID, OPEN_TRIP', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:15:00', { resultado: 'aprobado' }),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('INVALID')
      expect(r.flags).toContain('OPEN_TRIP')
    })

    it('orden inválido (F antes de E) → path ABCDFE no válido, INVALID_PATH', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:15:00', { resultado: 'aprobado' }),
        ev('DISCHARGE_END', '2024-01-01T08:45:00'),
        ev('EXIT', '2024-01-01T08:50:00'),
        ev('SCALE_OUT', '2024-01-01T08:55:00'),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('INVALID')
      expect(r.path).toBe('ABCDFE')
      expect(r.flags).toContain('INVALID_PATH')
    })

    it('OK pero sin D (cierre sin descarga con aprobado) → INVALID, D_WITHOUT_OK', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:15:00', { resultado: 'aprobado' }),
        ev('EXIT', '2024-01-01T08:20:00'),
      ]
      const r = validateTrip(events)
      expect(r.status).toBe('INVALID')
      expect(r.flags).toContain('D_WITHOUT_OK')
    })
  })

  describe('pathDisplay y explanation', () => {
    it('pathDisplay es secuencia con guiones', () => {
      const events: NormalizedEvent[] = [
        ev('GATE_CHECKIN', '2024-01-01T08:00:00'),
        ev('SCALE_IN', '2024-01-01T08:05:00'),
        ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00'),
        ev('LAB_RESULT_READY', '2024-01-01T08:15:00', { resultado: 'aprobado' }),
        ev('DISCHARGE_END', '2024-01-01T08:45:00'),
        ev('SCALE_OUT', '2024-01-01T08:50:00'),
        ev('EXIT', '2024-01-01T08:55:00'),
      ]
      const r = validateTrip(events)
      expect(r.pathDisplay).toBe('A-B-C-D-E-F')
      expect(r.explanation).toContain('Recorrido ideal')
    })
  })
})
