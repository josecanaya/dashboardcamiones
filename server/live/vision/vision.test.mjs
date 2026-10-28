import { describe, expect, it } from 'vitest'
import { parseVerdict } from './claudeVision.mjs'
import { cameraBackground, cosine, vehicleVector } from './vectorBase.mjs'

describe('respuesta de Claude', () => {
  it('JSON con texto o bloque de código alrededor', () => {
    expect(parseVerdict('Listo:\n```json\n{"eleccion": "b", "confianza": 0.9, "patente_vista": "roq 011", "motivo": "mismo calco"}\n```')).toEqual({ eleccion: 'B', confianza: 0.9, patente: 'ROQ011', motivo: 'mismo calco' })
  })
  it('«ninguno» no elige a nadie; la confianza queda entre 0 y 1', () => {
    expect(parseVerdict('{"eleccion":"ninguno","confianza":1.4,"motivo":"x"}')).toMatchObject({ eleccion: null, confianza: 1 })
  })
  it('sin JSON: null', () => {
    expect(parseVerdict('no puedo ver las imágenes')).toBeNull()
  })
})

describe('vector del vehículo', () => {
  const unit = (i, d = 4) => Array.from({ length: d }, (_, k) => (k === i ? 1 : 0))
  it('los parches iguales al fondo de la cámara no pesan', () => {
    // Parche 0 = fondo, parche 1 = el camión.
    const bg = cameraBackground([[unit(0), unit(2)], [unit(0), unit(3)]])
    const v = vehicleVector([unit(0), unit(1)], bg)
    expect(cosine(v, unit(1))).toBeGreaterThan(0.99)
    expect(cosine(vehicleVector([unit(0), unit(1)]), unit(1))).toBeLessThan(0.8)
  })
})
