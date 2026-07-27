/**
 * Invariantes de la fuente única de verdad de circuitos (CIRCUIT_CATALOG).
 *
 * Estrategia: línea base congelada (mismo idioma que ETLWORKBENCH_IMPORT_BASELINE
 * en scripts/check-arch-rules.mjs). La deuda conocida queda listada y NO crece:
 * cualquier caso nuevo hace fallar el test. No agregar entradas a las listas.
 */
import { describe, expect, it } from 'vitest'
import { CIRCUIT_CATALOG } from './circuitCatalog'
import { MATRIX_CODES_BY_PLANT_OP } from '../../config/kpiCircuitMatrix'

/**
 * Códigos que la matriz KPI ofrece como filtro pero que NO tienen definición en el
 * catálogo (medido 2026-07-26: 28 de 49). Filtrar por uno de estos no puede apoyarse
 * en secuencias ni cobertura — no existen. NO agregar entradas: hay que definirlos
 * en el catálogo o sacarlos de la matriz.
 */
const KNOWN_UNDEFINED_MATRIX_CODES = new Set([
  'R2', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R17', 'R18',
  'R21', 'R22', 'R23', 'R24', 'R25', 'R29', 'R33',
  'SL4', 'SL5', 'SL6', 'SL7', 'SL8', 'SL9',
  'SL10', 'SL11', 'SL12', 'SL13', 'SL14', 'SL15',
])

/**
 * Grupos de circuitos que comparten baseSequence dentro del MISMO kind.
 * Es deuda aceptada y conocida: por eso existe el estado NO_DIFERENCIABLE.
 * (Volcable 1/2, Kepler 1/2, transile C16 V1/V2, girasol, pellet.)
 */
const ACCEPTED_SAME_KIND_COLLISIONS = new Set([
  'R5|R6',
  'R19|R20',
  'R3|R4',
  'R27|R28',
  'R30|R31|R32',
])

/**
 * Colisiones de secuencia ENTRE kind distintos: por secuencia de cámaras es imposible
 * distinguir una recepción de una operación de líquido en San Lorenzo. Riesgo real de
 * clasificación cruzada; requiere un punto discriminante fuera de la secuencia.
 */
const ACCEPTED_CROSS_KIND_COLLISIONS = new Set(['SL1|SL2|SL3'])

/** Alias que resuelven a más de un código (ambigüedad heredada de los códigos legacy). */
const ACCEPTED_AMBIGUOUS_ALIASES = new Set([
  'CIRCUITO_VOLCABLE_1_2',
  'TRANSILE_VOLCABLE_BALANZA',
  'CIRCUITO_KEPLER_SILOS',
])

function allMatrixCodes(): Set<string> {
  const out = new Set<string>()
  for (const plant of Object.keys(MATRIX_CODES_BY_PLANT_OP) as (keyof typeof MATRIX_CODES_BY_PLANT_OP)[]) {
    const ops = MATRIX_CODES_BY_PLANT_OP[plant] as Record<string, string[]>
    for (const op of Object.keys(ops)) for (const c of ops[op]!) out.add(c)
  }
  return out
}

function sequenceGroups(): Map<string, { code: string; kind: string }[]> {
  const bySeq = new Map<string, { code: string; kind: string }[]>()
  for (const [code, entry] of Object.entries(CIRCUIT_CATALOG)) {
    if (!entry.baseSequence) continue
    const key = entry.baseSequence.join('>')
    bySeq.set(key, [...(bySeq.get(key) ?? []), { code, kind: entry.kind }])
  }
  return bySeq
}

describe('CIRCUIT_CATALOG — invariantes de fuente única', () => {
  it('la clave del registro coincide con entry.code', () => {
    for (const [key, entry] of Object.entries(CIRCUIT_CATALOG)) {
      expect(entry.code, `clave ${key} no coincide con code`).toBe(key)
    }
  })

  it('no aparecen códigos de matriz indefinidos fuera de la línea base', () => {
    const undefinedCodes = [...allMatrixCodes()]
      .filter((c) => !CIRCUIT_CATALOG[c])
      .filter((c) => !KNOWN_UNDEFINED_MATRIX_CODES.has(c))
      .sort()
    expect(
      undefinedCodes,
      `códigos nuevos en la matriz KPI sin definición en CIRCUIT_CATALOG: ${undefinedCodes.join(', ')}`
    ).toEqual([])
  })

  it('la línea base de códigos indefinidos no crece (y se achica al definirlos)', () => {
    const stillUndefined = [...KNOWN_UNDEFINED_MATRIX_CODES].filter((c) => !CIRCUIT_CATALOG[c])
    expect(stillUndefined.length).toBeLessThanOrEqual(KNOWN_UNDEFINED_MATRIX_CODES.size)
  })

  it('no hay colisiones de baseSequence fuera de la línea base', () => {
    const unexpected: string[] = []
    for (const [seq, group] of sequenceGroups()) {
      if (group.length < 2) continue
      const key = group.map((g) => g.code).sort().join('|')
      const crossKind = new Set(group.map((g) => g.kind)).size > 1
      const accepted = crossKind
        ? ACCEPTED_CROSS_KIND_COLLISIONS.has(key)
        : ACCEPTED_SAME_KIND_COLLISIONS.has(key)
      if (!accepted) unexpected.push(`${crossKind ? 'CROSS-KIND' : 'mismo-kind'} ${key} (${seq})`)
    }
    expect(unexpected, `colisiones de secuencia nuevas: ${unexpected.join(' ; ')}`).toEqual([])
  })

  it('no hay alias ambiguos fuera de la línea base', () => {
    const byAlias = new Map<string, string[]>()
    for (const [code, entry] of Object.entries(CIRCUIT_CATALOG)) {
      for (const alias of entry.aliases ?? []) {
        byAlias.set(alias, [...(byAlias.get(alias) ?? []), code])
      }
    }
    const unexpected = [...byAlias.entries()]
      .filter(([alias, codes]) => codes.length > 1 && !ACCEPTED_AMBIGUOUS_ALIASES.has(alias))
      .map(([alias, codes]) => `${alias} -> ${codes.join(',')}`)
    expect(unexpected, `alias ambiguos nuevos: ${unexpected.join(' ; ')}`).toEqual([])
  })

  it('todo circuito habilitado para clasificar declara secuencia o punto fuerte', () => {
    const sinEvidencia = Object.values(CIRCUIT_CATALOG)
      .filter((e) => e.enabledForClassification)
      .filter((e) => !e.baseSequence && !e.hasStrongPoint)
      .map((e) => e.code)
    expect(sinEvidencia, `habilitados sin secuencia ni punto fuerte: ${sinEvidencia.join(', ')}`).toEqual([])
  })
})
