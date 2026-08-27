import { describe, expect, it } from 'vitest'
import { lookupSanLorenzoCameraByDevice } from './sanLorenzoCameraCatalog'

describe('sanLorenzoCameraCatalog — alias de devices', () => {
  it('SLZCalCam mapea a Calado San Lorenzo (SL_CALADA)', () => {
    expect(lookupSanLorenzoCameraByDevice('SLZCalCam')?.logicalCode).toBe('SL_CALADA')
  })

  it('SLZCalado (device real de la calada de puerto) también mapea a SL_CALADA', () => {
    const def = lookupSanLorenzoCameraByDevice('SLZCalado')
    expect(def?.logicalCode).toBe('SL_CALADA')
    expect(def?.logicalSector).toBe('S2')
  })

  it('el alias es case-insensitive', () => {
    expect(lookupSanLorenzoCameraByDevice('slzcalado')?.logicalCode).toBe('SL_CALADA')
  })
})
