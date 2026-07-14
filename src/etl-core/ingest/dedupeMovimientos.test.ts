import { describe, it, expect } from 'vitest'
import { dedupeMovimientosByOperationId } from './dedupeMovimientos'

type Row = {
  external_operation_id: string
  plate_normalized?: string
  external_ingreso_at?: string
  external_calado_at?: string
  external_salida_at?: string
  source_file?: string
}

describe('dedupeMovimientosByOperationId', () => {
  it('colapsa la misma operación cargada desde dos archivos que se solapan', () => {
    const rows: Row[] = [
      { external_operation_id: 'COMPROB_419287', plate_normalized: 'AD887XZ', source_file: 'semana_W10.xlsx' },
      { external_operation_id: 'COMPROB_419344', plate_normalized: 'AD887XZ', source_file: 'semana_W10.xlsx' },
      // Solape: la misma operación reaparece en el archivo de la semana siguiente.
      { external_operation_id: 'COMPROB_419287', plate_normalized: 'AD887XZ', source_file: 'semana_W11.xlsx' },
    ]
    const r = dedupeMovimientosByOperationId(rows)
    expect(r.deduped).toHaveLength(2)
    expect(r.duplicatesRemoved).toBe(1)
    expect(r.collapsedGroups).toBe(1)
    expect(r.deduped.map((x) => x.external_operation_id)).toEqual(['COMPROB_419287', 'COMPROB_419344'])
  })

  it('conserva la fila más completa ante duplicado', () => {
    const rows: Row[] = [
      { external_operation_id: 'CTG_100', external_ingreso_at: '2026-05-01T08:00:00Z' },
      {
        external_operation_id: 'CTG_100',
        external_ingreso_at: '2026-05-01T08:00:00Z',
        external_calado_at: '2026-05-01T09:00:00Z',
        external_salida_at: '2026-05-01T10:00:00Z',
      },
    ]
    const r = dedupeMovimientosByOperationId(rows)
    expect(r.deduped).toHaveLength(1)
    expect(r.deduped[0]!.external_salida_at).toBe('2026-05-01T10:00:00Z')
  })

  it('NO colapsa operaciones legítimamente distintas (ids distintos)', () => {
    const rows: Row[] = [
      { external_operation_id: 'COMPROB_10', plate_normalized: 'AAA111' },
      { external_operation_id: 'COMPROB_11', plate_normalized: 'BBB222' },
    ]
    const r = dedupeMovimientosByOperationId(rows)
    expect(r.deduped).toHaveLength(2)
    expect(r.duplicatesRemoved).toBe(0)
  })

  it('preserva el orden de primera aparición', () => {
    const rows: Row[] = [
      { external_operation_id: 'B' },
      { external_operation_id: 'A' },
      { external_operation_id: 'B' },
      { external_operation_id: 'C' },
    ]
    const r = dedupeMovimientosByOperationId(rows)
    expect(r.deduped.map((x) => x.external_operation_id)).toEqual(['B', 'A', 'C'])
  })

  it('las filas sin id estable se conservan tal cual (no se deduplican)', () => {
    const rows: Row[] = [
      { external_operation_id: '' },
      { external_operation_id: '' },
      { external_operation_id: 'CTG_5' },
    ]
    const r = dedupeMovimientosByOperationId(rows)
    expect(r.deduped).toHaveLength(3)
    expect(r.duplicatesRemoved).toBe(0)
  })

  it('caso realista: 3 archivos con ~3.5x de solape colapsan al set único', () => {
    const unique = Array.from({ length: 266 }, (_, i) => ({
      external_operation_id: `COMPROB_${1000 + i}`,
      plate_normalized: `P${i}`,
    }))
    // Simula 3 cargas con solapamiento parcial => 930 filas.
    const loaded: Row[] = [
      ...unique,
      ...unique.slice(0, 200),
      ...unique.slice(0, 200),
      ...unique.slice(0, 64),
    ]
    expect(loaded).toHaveLength(730) // 266+200+200+64
    const r = dedupeMovimientosByOperationId(loaded)
    expect(r.deduped).toHaveLength(266)
    expect(r.duplicatesRemoved).toBe(730 - 266)
  })
})
