import { describe, expect, it } from 'vitest'
import { compareAttribute, plateLikelihood, scoreCandidates } from './identificationEvidence.mjs'

describe('evidencia por candidato', () => {
  it('marca igual suma, distinta resta; sin dato no cuenta', () => {
    expect(compareAttribute('marca', 'Scania', 'Scania').lr).toBeGreaterThan(4)
    expect(compareAttribute('marca', 'Scania', 'Iveco').lr).toBeLessThan(0.3)
    expect(compareAttribute('marca', 'Unrecognized', 'Iveco')).toMatchObject({ result: 'sin_dato', lr: 1 })
  })

  it('camión contra pickup pesa más que grande contra mediano', () => {
    expect(compareAttribute('tipo', 'Large Truck', 'Pickup').lr).toBeLessThan(compareAttribute('tipo', 'Large Truck', 'Medium Truck').lr)
  })

  it('la patente parecida con atributos iguales gana; con marca y color distintos gana «otro camión»', () => {
    const read = { readPlate: 'AB912RO', validFormat: true, readAttrs: { vehicleColor: 'White', vehicleBrand: 'Volkswagen', vehicleCategory: 'SUV' } }
    const base = { plate: 'AB912PO', similarity: 0.86, nodeProbability: 0.8, circuit: 'R3', circuitProbability: 0.7 }
    const same = scoreCandidates(read, [{ ...base, attrs: { vehicleColor: 'White', vehicleBrand: 'Volkswagen', vehicleCategory: 'SUV' } }])
    const diff = scoreCandidates(read, [{ ...base, attrs: { vehicleColor: 'Red', vehicleBrand: 'Scania', vehicleCategory: 'Large Truck' } }])
    expect(same.candidates[0].probability).toBeGreaterThan(same.otherProbability)
    expect(diff.otherProbability).toBeGreaterThan(diff.candidates[0].probability)
  })

  it('verosimilitud de patente decrece con el parecido', () => {
    expect(plateLikelihood(1)).toBe(1)
    expect(plateLikelihood(0.83)).toBeLessThan(0.3)
  })
})
