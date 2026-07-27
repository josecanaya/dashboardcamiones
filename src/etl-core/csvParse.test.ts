import { describe, expect, it } from 'vitest'
import { parseCsvToRecords } from './csvParse'
import { recordsToCsv } from './csv'

describe('parseCsvToRecords — comillas y comas', () => {
  it('respeta comas dentro de campos citados (no corre las columnas)', () => {
    const { headers, rows } = parseCsvToRecords('a,b,date_min\n"x,y",0,2026-05-05')
    expect(headers).toEqual(['a', 'b', 'date_min'])
    expect(rows[0]).toEqual({ a: 'x,y', b: '0', date_min: '2026-05-05' })
  })

  it('round-trip fiel con recordsToCsv cuando hay comas en los valores', () => {
    const headers = ['a', 'b', 'date_min', 'date_max']
    const row = { a: 'x,y', b: '0', date_min: '2026-05-05', date_max: '2026-05-06' }
    const parsed = parseCsvToRecords(recordsToCsv(headers, [row]))
    expect(parsed.rows[0]).toEqual(row)
  })

  it('desescapa comillas dobles internas', () => {
    const { rows } = parseCsvToRecords('a,b\n"dice ""hola""",2')
    expect(rows[0]!.a).toBe('dice "hola"')
    expect(rows[0]!.b).toBe('2')
  })

  it('no corta la fila en un salto de línea citado', () => {
    const { rows } = parseCsvToRecords('a,b\n"linea1\nlinea2",2')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.a).toBe('linea1\nlinea2')
    expect(rows[0]!.b).toBe('2')
  })

  it('varias columnas citadas seguidas mantienen alineación', () => {
    const headers = ['c1', 'c2', 'c3', 'c4']
    const row = { c1: 'a,b', c2: 'c,d', c3: 'sin coma', c4: 'e,f' }
    const parsed = parseCsvToRecords(recordsToCsv(headers, [row]))
    expect(parsed.rows[0]).toEqual(row)
  })

  it('campos vacíos y valores sin comillas siguen funcionando', () => {
    const { rows } = parseCsvToRecords('a,b,c\n1,,3')
    expect(rows[0]).toEqual({ a: '1', b: '', c: '3' })
  })
})
