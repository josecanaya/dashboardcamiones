import {describe,it,expect} from 'vitest'
import {assessVehicleRelevance,excludeIrrelevantEvents} from './vehicleRelevance.mjs'
const base = {site:'san_lorenzo',item:{deviceCode:'SLZTK400',readPlate:'ABC123',level:'provisorio',candidates:[]},capture:{plate:'ABC123',vehicleCategory:'Pickup',diffMs:0},historyAvailable:true,reads:[]}
describe('descarte por relevancia de acceso compartido',()=> {
  it('excluye solo la visita descartada, no toda esa patente ni una reapertura',()=>{
    const events=[{id:'one',plate:'ABC123'},{id:'two',plate:'ABC123'}]
    const discarded={fragmentKey:'one',level:'rechazado',decision:{source:'automatic_relevance'}}
    expect(excludeIrrelevantEvents(events,[discarded],e=>e.id)).toEqual([events[1]])
    expect(excludeIrrelevantEvents(events,[{...discarded,level:'provisorio'}],e=>e.id)).toEqual(events)
  })
  it.each(['Pickup','Bus','Car','SUV','Van','Sedan','Minibus'])('descarta %s sin recorrido operativo',type=>expect(assessVehicleRelevance({...base,capture:{...base.capture,vehicleCategory:type}}).reject).toBe(true))
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
