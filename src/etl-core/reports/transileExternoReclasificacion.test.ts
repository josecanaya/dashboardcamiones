import { describe, expect, it } from 'vitest'
import {
  applyTransileExternoCircuitOverrides,
  buildTransileExternoReclasificacion,
} from './transileExternoReclasificacion'
import type { TransileExternoOperation } from './transileExternoCiclo'

function op(partial: Partial<TransileExternoOperation>): TransileExternoOperation {
  return {
    external_operation_id: 'op1',
    patente: 'AB123CD',
    fecha: '2026-01-15',
    producto: 'SOJA',
    product_family: 'SOJA',
    circuit_candidates: 'R26',
    circuit_assigned: 'R26',
    es_de_vuelta: true,
    external_ingreso_at: '2026-01-15T10:00:00-03:00',
    external_salida_at: '2026-01-15T18:00:00-03:00',
    planta: 'RICARDONE',
    plataforma: 'CELDA_16',
    cycle_index: 1,
    source_file: 'x.xlsx',
    ...partial,
  }
}

describe('transileExternoReclasificacion', () => {
  it('propone R26 para journey ANOMALO con overlap de patente/tiempo', () => {
    const rows = buildTransileExternoReclasificacion(
      [op({})],
      [
        {
          journey_uid: 'j1',
          plate: 'AB123CD',
          start_at: '2026-01-15T12:00:00-03:00',
          end_at: '2026-01-15T14:00:00-03:00',
          executive_status: 'ANOMALO',
          executive_circuit_code: '',
        },
      ]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.circuito_propuesto).toBe('R26')
    expect(rows[0]!.journey_uid).toBe('j1')
  })

  it('apply override actualiza circuito ejecutivo', () => {
    const entries = [
      {
        journeyId: 'j1',
        executiveCircuitCode: '',
        executiveCircuitLabel: '',
        executiveCircuitDisplay: '',
        executiveStatus: 'ANOMALO',
        committeeReason: 'x',
      },
    ]
    const out = applyTransileExternoCircuitOverrides(
      entries,
      [
        {
          journey_uid: 'j1',
          patente: 'AB123CD',
          estado_original: 'ANOMALO',
          circuito_original: '—',
          circuito_propuesto: 'R26',
          producto_excel: 'SOJA',
          product_family: 'SOJA',
          external_operation_id: 'op1',
          evidencia: 'test',
        },
      ],
      () => 'Transile externo Soja (Celda 16)'
    )
    expect(out[0]!.executiveCircuitCode).toBe('R26')
    expect(out[0]!.executiveStatus).toBe('VALIDO')
    expect(out[0]!.committeeReason).toContain('EXCEL_TRANSILE_EXTERNO')
  })
})
