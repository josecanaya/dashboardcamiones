import { describe, expect, it } from 'vitest'
import { makeTable, tableToCsv } from './typedTable'

describe('TypedTable', () => {
  it('tableToCsv respeta headers y emite cabecera + filas', () => {
    const table = makeTable(
      'demo',
      ['id', 'name'] as const,
      [
        { id: 'a', name: 'uno' },
        { id: 'b', name: 'dos' },
      ]
    )
    const csv = tableToCsv(table)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('id,name')
    expect(lines[1]).toBe('a,uno')
    expect(lines[2]).toBe('b,dos')
  })
})
