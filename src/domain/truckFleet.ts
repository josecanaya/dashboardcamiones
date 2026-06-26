export type PlantVisitProductOrigin = 'contrato' | 'manual' | 'desconocido'
export type PlantVisitSource = 'truckflow' | 'contrato' | 'mixto'

export type CamionProfile = {
  plateNormalized: string
  plateDisplay: string | null
  transportista: string | null
  tipoVinculo: string | null
  marca: string | null
  color: string | null
  tipoVehiculo: string | null
  notas: string | null
  primeraVisitaAt: string | null
  ultimaVisitaAt: string | null
  totalVisitas: number
  createdAt?: string
  updatedAt?: string
}

export type VisitaPlanta = {
  id: string
  plateNormalized: string
  planta: string
  ingresoAt: string
  egresoAt: string | null
  fechaOperativa: string
  producto: string | null
  productoOrigen: PlantVisitProductOrigin | null
  journeyUid: string | null
  fuente: PlantVisitSource
  createdAt?: string
  updatedAt?: string
}

export type PlantVisitUpsertInput = {
  plateNormalized: string
  plateDisplay?: string
  planta: string
  ingresoAt: string
  egresoAt?: string | null
  fechaOperativa: string
  producto?: string | null
  productoOrigen?: PlantVisitProductOrigin | null
  journeyUid?: string | null
  fuente?: PlantVisitSource
}

export type FleetPlateLookupResult = {
  plate: string
  storage: string
  camion: CamionProfile | null
  visitas: VisitaPlanta[]
  registryEntry: {
    id: string
    plate: string
    category: string
    label?: string
    notes?: string
  } | null
  summary: {
    totalVisitas: number
    productosDistintos: string[]
    primeraVisitaAt: string | null
    ultimaVisitaAt: string | null
  }
}
