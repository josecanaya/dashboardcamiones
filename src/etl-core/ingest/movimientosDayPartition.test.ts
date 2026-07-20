import { describe, it, expect } from 'vitest'
import {
  dayIsoFromMovimiento,
  partitionMovimientosByDay,
  mergeMovimientosDedup,
} from './movimientosDayPartition'

const row = (id: string, opts?: { ing?: string; sal?: string; src?: string }) => ({
  external_operation_id: id,
  external_ingreso_at: opts?.ing,
  external_salida_at: opts?.sal,
  source_date: opts?.src,
})

describe('dayIsoFromMovimiento', () => {
  it('prioriza external_salida_at (día Excel = horario de salida)', () => {
    expect(
      dayIsoFromMovimiento(
        row('A', { ing: '2026-05-04T22:30:00', sal: '2026-05-05T01:15:00' })
      )
    ).toBe('2026-05-05')
  })
  it('cae a source_date si no hay salida', () => {
    expect(dayIsoFromMovimiento(row('A', { src: '2026-05-06' }))).toBe('2026-05-06')
  })
  it('cae a ingreso si no hay salida ni source_date', () => {
    expect(dayIsoFromMovimiento(row('A', { ing: '2026-05-04T08:30:00' }))).toBe('2026-05-04')
  })
  it('vacío si no hay fecha resoluble', () => {
    expect(dayIsoFromMovimiento(row('A', { ing: 'sin fecha' }))).toBe('')
  })
})

describe('partitionMovimientosByDay', () => {
  it('agrupa por día de salida y separa sin-fecha', () => {
    const rows = [
      row('A', { sal: '2026-05-04T08:00:00' }),
      row('B', { sal: '2026-05-04T12:00:00' }),
      row('C', { sal: '2026-05-05T09:00:00' }),
      row('D', { ing: 'x' }),
    ]
    const { byDay, undated } = partitionMovimientosByDay(rows)
    expect([...byDay.keys()].sort()).toEqual(['2026-05-04', '2026-05-05'])
    expect(byDay.get('2026-05-04')!.map((r) => r.external_operation_id)).toEqual(['A', 'B'])
    expect(byDay.get('2026-05-05')!).toHaveLength(1)
    expect(undated.map((r) => r.external_operation_id)).toEqual(['D'])
  })

  it('overnight: ingreso D / salida D+1 cae en día D+1', () => {
    const { byDay } = partitionMovimientosByDay([
      row('N', { ing: '2026-05-04T23:00:00', sal: '2026-05-05T02:00:00' }),
    ])
    expect([...byDay.keys()]).toEqual(['2026-05-05'])
  })

  it('un Excel de meses reparte cada fila a su día', () => {
    const rows = Array.from({ length: 90 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 3, 1 + i)) // abril→junio
      return row(`OP${i}`, { sal: `${d.toISOString().slice(0, 10)}T10:00:00` })
    })
    const { byDay } = partitionMovimientosByDay(rows)
    expect(byDay.size).toBe(90)
    for (const arr of byDay.values()) expect(arr).toHaveLength(1)
  })
})

describe('mergeMovimientosDedup', () => {
  it('re-cargar el mismo día no infla (idempotente)', () => {
    const existing = [
      row('CTG_1', { sal: '2026-05-04T08:00:00' }),
      row('CTG_2', { sal: '2026-05-04T09:00:00' }),
    ]
    const incoming = [
      row('CTG_2', { sal: '2026-05-04T09:00:00' }),
      row('CTG_3', { sal: '2026-05-04T10:00:00' }),
    ]
    const { merged, added, duplicatesRemoved } = mergeMovimientosDedup(existing, incoming)
    expect(merged.map((r) => r.external_operation_id).sort()).toEqual(['CTG_1', 'CTG_2', 'CTG_3'])
    expect(added).toBe(1) // solo CTG_3 es nuevo
    expect(duplicatesRemoved).toBe(1) // CTG_2 repetido
  })

  it('re-cargar exactamente lo mismo deja el set igual', () => {
    const existing = [row('CTG_1', { sal: '2026-05-04T08:00:00' })]
    const { merged, added } = mergeMovimientosDedup(existing, [...existing])
    expect(merged).toHaveLength(1)
    expect(added).toBe(0)
  })
})
