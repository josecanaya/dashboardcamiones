import { describe, expect, it } from 'vitest'
import { identifyFragments, nodeModelCatalog } from './plateIdentification.mjs'

const catalog = nodeModelCatalog()
const now = Date.parse('2026-10-08T12:00:00-03:00')
const ev = (plate, uid, sector, device, wall) => {
  const at = new Date(Date.parse(`2026-10-08T${wall}-03:00`) - 206 * 60_000).toISOString()
  return {journeyUid:uid,truckPlate:plate,normalizedPlate:plate,sectorCode:sector,deviceCode:device,occurredAt:at,recordedAt:at}
}
describe('universo conocido en el momento de la captura', () => {
  it('una gemela anterior y otra posterior no rompen la selección del rival', () => {
    const events = [ev('AAA000','past','2-S2','RicCal03','09:59:00'),ev('AAA00','bad','2-S2','RicCal04','10:00:00'),ev('AAA008','future','2-S2','RicCal05','10:01:00')]
    const item = identifyFragments(events,now,{catalog}).items.find(i=>i.readPlate==='AAA00')
    expect(item.candidates).toHaveLength(2)
    expect(item.candidates.find(c=>c.plate==='AAA008').automaticEligible).toBe(false)
  })
  it('una lectura gemela posterior queda disponible para revisión, sin aplicarse sola', () => {
    const events = [ev('AAA00','bad','2-S2','RicCal04','10:00:00'),ev('AAA000','good','2-S2','RicCal03','10:01:00')]
    const item = identifyFragments(events,now,{catalog}).items.find(i=>i.readPlate==='AAA00')
    expect(item.candidates[0]).toMatchObject({plate:'AAA000',seenAfter:true,inUniverse:false,automaticEligible:false,reads:0})
    expect(item.assignedPlate).toBeNull()
    expect(item.evidenceEligible).toBe(false)
  })
  it('las lecturas futuras no completan el mínimo de evidencia anterior para una patente válida', () => {
    const events = [
      ev('AC297HX','good','2-S4','RicB3Ingreso','10:00:00'),
      ev('AC297UX','bad','2-S4','RicB3Ingreso','10:15:00'),
      ev('AC297HX','good','2-S6','RicS6Playa3','10:30:00'),
    ]
    const item = identifyFragments(events,now,{catalog}).items.find(i=>i.readPlate==='AC297UX')
    expect(item.candidates[0].reads).toBe(1)
    expect(item.assignedPlate).toBeNull()
    expect(item.level).toBe('provisorio')
  })
  it('una lectura gemela anterior sigue siendo evidencia automática para un fragmento', () => {
    const events = [ev('AAA000','good','2-S2','RicCal03','10:00:00'),ev('AAA00','bad','2-S2','RicCal04','10:01:00')]
    const item = identifyFragments(events,now,{catalog}).items.find(i=>i.readPlate==='AAA00')
    expect(item.assignedPlate).toBe('AAA000')
  })
  it('la decisión humana puede recuperar una referencia posterior', () => {
    const events = [ev('AAA00','bad','2-S2','RicCal04','10:00:00'),ev('AAA000','good','2-S2','RicCal03','10:01:00')]
    const item = identifyFragments(events,now,{catalog,decisions:{bad:{action:'confirm',plate:'AAA000',journeyUid:'good'}}}).items.find(i=>i.readPlate==='AAA00')
    expect(item.level).toBe('confirmado')
    expect(item.assignedPlate).toBe('AAA000')
  })
})
