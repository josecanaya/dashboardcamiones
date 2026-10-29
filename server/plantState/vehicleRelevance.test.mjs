import {describe,it,expect} from 'vitest'
import {assessVehicleRelevance,excludeIrrelevantEvents,excludeNonTrucks,splitNonTrucks} from './vehicleRelevance.mjs'
const base = {site:'san_lorenzo',item:{deviceCode:'SLZTK400',readPlate:'ABC123',level:'provisorio',candidates:[]},capture:{plate:'ABC123',vehicleCategory:'Pickup',diffMs:0},historyAvailable:true,reads:[]}
describe('descarte por relevancia de acceso compartido',()=> {
  it('excluye solo la visita descartada, no toda esa patente ni una reapertura',()=>{
    const events=[{id:'one',plate:'ABC123'},{id:'two',plate:'ABC123'}]
    const discarded={fragmentKey:'one',level:'rechazado',decision:{source:'automatic_relevance'}}
    expect(excludeIrrelevantEvents(events,[discarded],e=>e.id)).toEqual([events[1]])
    expect(excludeIrrelevantEvents(events,[{...discarded,level:'provisorio'}],e=>e.id)).toEqual(events)
  })
  it.each(['Pickup','Bus','Car','SUV','Van','Sedan','Minibus','MPV','Medium Bus'])('descarta %s sin recorrido operativo',type=>expect(assessVehicleRelevance({...base,capture:{...base.capture,vehicleCategory:type}}).reject).toBe(true))
  it.each(['Large Truck','Small Truck','Unknown','Other',null])('preserva %s',type=>expect(assessVehicleRelevance({...base,capture:{...base.capture,vehicleCategory:type}}).reject).toBe(false))
  it('no descarta un camión mal clasificado en DSS que pasó por balanza',()=>expect(assessVehicleRelevance({...base,reads:[{deviceCode:'SLZBalIngFte'}]}).reason).toBe('recorrido_operativo'))
  it('protege candidatos operativos parecidos',()=>expect(assessVehicleRelevance({...base,item:{...base.item,candidates:[{similarity:.83,inUniverse:true,recentReads:[{device:'RicCal04'}]}]}}).reject).toBe(false))
  it('no usa pasos de candidatos sin parecido para bloquear',()=>expect(assessVehicleRelevance({...base,item:{...base.item,candidates:[{similarity:.2,inUniverse:true,photoDevice:'SLZBalIngFte'}]}}).reject).toBe(true))
  it('tolera la diferencia medida de C1 dentro de la ventana de búsqueda de 5 segundos',()=>expect(assessVehicleRelevance({...base,capture:{...base.capture,diffMs:4089}}).reject).toBe(true))
  it('protege decisión o reserva humana',()=>{for(const field of ['decision','claim']) expect(assessVehicleRelevance({...base,item:{...base.item,[field]:{}}}).reject).toBe(false)})
  it('exige historia y correspondencia precisa de captura',()=>{
    expect(assessVehicleRelevance({...base,historyAvailable:false}).reject).toBe(false)
    for(const change of [{plate:'XYZ987'},{diffMs:5001},{diffMs:null}]) expect(assessVehicleRelevance({...base,capture:{...base.capture,...change}}).reject).toBe(false)
  })
  it('limita la regla a TK400 y los egresos de San Lorenzo',()=>{
    expect(assessVehicleRelevance({...base,site:'ricardone'}).reject).toBe(false)
    expect(assessVehicleRelevance({...base,item:{...base.item,deviceCode:'SLZBalIngFte'}}).reject).toBe(false)
    expect(assessVehicleRelevance({...base,item:{...base.item,deviceCode:'SLZSalidaC2Tras'}}).reject).toBe(true)
  })
})

describe('lo que no es camión no cuenta en la planta', () => {
  const ev = (plate, t = 1000) => ({ plate, t })
  const ctx = (extra = {}) => ({ plateOf: (e) => e.plate, timeOf: (e) => e.t, ...extra })
  it('saca no camiones, livianos fuera del sistema y lo que la IA vio liviano; deja camiones', () => {
    const items = [
      { readPlate: 'OIY765', rule: 'no_camion', level: 'fuera_sistema' },
      { readPlate: 'AA208QN', level: 'fuera_sistema', attributes: { vehicleClass: 'liviano' } },
      { readPlate: 'MOB09', level: 'pendiente', ia: { vehicleType: 'maquinaria', plate: null } },
      { readPlate: 'AF861FZ', level: 'fuera_sistema' },
      { readPlate: 'XX1', assignedPlate: 'TAO150', rule: 'cuenta', level: 'casi_seguro' },
    ]
    const out = excludeNonTrucks([ev('OIY765'), ev('AA208QN'), ev('MOB09'), ev('AF861FZ'), ev('TAO150'), ev('AD001TD')], items, ctx({ noCamiones: { lookup: (p) => (p === 'AD001TD' ? { kind: 'liviano' } : null) } }))
    expect(out.map((e) => e.plate)).toEqual(['AF861FZ', 'TAO150'])
  })
  it('con carta de porte vigente es un camión aunque figure como no camión; la balanza no decide', () => {
    const out = excludeNonTrucks([ev('OIY765'), ev('AH456NL')], [{ readPlate: 'OIY765', rule: 'no_camion' }, { readPlate: 'AH456NL', rule: 'no_camion' }], ctx({ padron: { at: () => null, cartaAt: (p) => (p === 'OIY765' ? { ctg: '1' } : null) }, balanza: { truckAt: () => ({ cod: '0301' }) } }))
    expect(out.map((e) => e.plate)).toEqual(['OIY765'])
  })
})

describe('el plano es solo de camiones de granos', () => {
  const ev = (plate, t = 1000) => ({ plate, t })
  const base = { plateOf: (e) => e.plate, timeOf: (e) => e.t }
  it('Vehículos Permitidos (agua) va a la lista; con carta vigente queda en el plano; sin nada, queda como caso', () => {
    const padron = {
      at: (p) => (['BTS626', 'AGU111'].includes(p) ? { source: 'permitido', category: 'agua' } : null),
      cartaAt: (p) => (p === 'AGU111' ? { ctg: '1' } : null),
    }
    const r = splitNonTrucks([ev('BTS626'), ev('AGU111'), ev('XYZ999')], [], { ...base, padron })
    expect(r.trucks.map((e) => e.plate)).toEqual(['AGU111', 'XYZ999'])
    expect(r.others.map((e) => e.plate)).toEqual(['BTS626'])
    expect(r.whyOf('BTS626').label).toBe('Vehículos Permitidos (agua)')
  })
})
