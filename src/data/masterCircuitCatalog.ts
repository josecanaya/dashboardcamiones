import type { SiteId } from '../domain/sites'

export interface MasterCircuitItem {
  codigo: string
  nombre: string
  codigoCircuito: string
  codigoVuelta: string
  tipo: 'recepcion' | 'despacho' | 'movimiento_interno'
  subtipo: 'solidos' | 'liquidos' | 'transile'
  destino: string
  descripcion: string
}

export interface MasterCircuitGroup {
  id: string
  nombre: string
  color: string
  circuitos: MasterCircuitItem[]
}

export interface MasterPlantCatalog {
  planta: string
  grupos: MasterCircuitGroup[]
}

export const MASTER_CIRCUIT_CATALOG: Record<SiteId, MasterPlantCatalog> = {
  ricardone: {
    planta: 'Ricardone',
    grupos: [
      {
        id: 'recepcion_solidos',
        nombre: 'Recepción mercadería sólida',
        color: 'blue',
        circuitos: [
          { codigo: 'A1', nombre: 'Descarga Celda 16', codigoCircuito: 'CIR_01_V01', codigoVuelta: 'VUE_01_V01', tipo: 'recepcion', subtipo: 'solidos', destino: 'Celda 16', descripcion: 'Ingreso a planta, calada, balanza, descarga en Celda 16, retorno por balanza y egreso.' },
          { codigo: 'A2', nombre: 'Descarga Celda N', codigoCircuito: 'CIR_01_V02', codigoVuelta: 'VUE_01_V02', tipo: 'recepcion', subtipo: 'solidos', destino: 'Celda N', descripcion: 'Ingreso a planta, calada, balanza, descarga en Celda N, retorno y egreso.' },
          { codigo: 'A3', nombre: 'Descarga Silos Kepler', codigoCircuito: 'CIR_01_V03', codigoVuelta: 'VUE_01_V03', tipo: 'recepcion', subtipo: 'solidos', destino: 'Silos Kepler', descripcion: 'Ingreso a planta, calada, balanza, descarga en silos Kepler, retorno y egreso.' },
          { codigo: 'A4', nombre: 'Descarga Volcable 1', codigoCircuito: 'CIR_01_V04', codigoVuelta: 'VUE_01_V04', tipo: 'recepcion', subtipo: 'solidos', destino: 'Volcable 1', descripcion: 'Ingreso a planta, calada, balanza, descarga en Volcable 1, retorno y egreso.' },
          { codigo: 'A5', nombre: 'Descarga Volcable 2', codigoCircuito: 'CIR_01_V05', codigoVuelta: 'VUE_01_V05', tipo: 'recepcion', subtipo: 'solidos', destino: 'Volcable 2', descripcion: 'Ingreso a planta, calada, balanza, descarga en Volcable 2, retorno y egreso.' },
          { codigo: 'A6', nombre: 'Descarga Volcable 3', codigoCircuito: 'CIR_01_V06', codigoVuelta: 'VUE_01_V06', tipo: 'recepcion', subtipo: 'solidos', destino: 'Volcable 3', descripcion: 'Ingreso a planta, calada, balanza, descarga en Volcable 3, retorno y egreso.' },
          { codigo: 'A7', nombre: 'Descarga San Lorenzo', codigoCircuito: 'CIR_06_V01', codigoVuelta: 'VUE_06_V01', tipo: 'recepcion', subtipo: 'solidos', destino: 'San Lorenzo', descripcion: 'Ingreso a planta, calada y egreso hacia San Lorenzo.' },
        ],
      },
      {
        id: 'despacho_solidos',
        nombre: 'Despacho mercadería sólida',
        color: 'green',
        circuitos: [
          { codigo: 'B1', nombre: 'Carga Celda 16', codigoCircuito: 'CIR_02_V01', codigoVuelta: 'VUE_02_V01', tipo: 'despacho', subtipo: 'solidos', destino: 'Celda 16', descripcion: 'Ingreso a planta, balanza, carga en Celda 16, balanza, calada vacío/lleno y egreso.' },
          { codigo: 'B2', nombre: 'Carga Silos Kepler', codigoCircuito: 'CIR_02_V03', codigoVuelta: 'VUE_02_V03', tipo: 'despacho', subtipo: 'solidos', destino: 'Silos Kepler', descripcion: 'Ingreso a planta, balanza, carga en silos Kepler, retorno, calada y egreso.' },
          { codigo: 'B3', nombre: 'Carga Celda N', codigoCircuito: 'CIR_02_V02', codigoVuelta: 'VUE_02_V02', tipo: 'despacho', subtipo: 'solidos', destino: 'Celda N', descripcion: 'Ingreso a planta, balanza, carga en Celda N, retorno, calada y egreso.' },
        ],
      },
      {
        id: 'liquidos',
        nombre: 'Líquidos',
        color: 'purple',
        circuitos: [
          { codigo: 'C1', nombre: 'Descarga Líquido', codigoCircuito: 'CIR_03_V01', codigoVuelta: 'VUE_03_V01', tipo: 'recepcion', subtipo: 'liquidos', destino: 'Descarga líquidos', descripcion: 'Ingreso a planta, calada, balanza, descarga de líquidos y egreso.' },
          { codigo: 'D1', nombre: 'Carga Líquido', codigoCircuito: 'CIR_04_V01', codigoVuelta: 'VUE_04_V01', tipo: 'despacho', subtipo: 'liquidos', destino: 'Carga líquidos', descripcion: 'Ingreso a planta, calada, balanza, carga de líquidos y egreso.' },
        ],
      },
      {
        id: 'movimientos_internos',
        nombre: 'Movimientos internos / transiles',
        color: 'orange',
        circuitos: [
          { codigo: 'E1', nombre: 'Silos Kepler -> Celda 16', codigoCircuito: 'CIR_05_V01', codigoVuelta: 'VUE_05_V01', tipo: 'movimiento_interno', subtipo: 'transile', destino: 'Silos a Celda 16', descripcion: 'Movimiento interno entre silos Kepler y Celda 16.' },
          { codigo: 'E2', nombre: 'Celda N -> Silos Kepler', codigoCircuito: 'CIR_05_V02', codigoVuelta: 'VUE_05_V02', tipo: 'movimiento_interno', subtipo: 'transile', destino: 'Celda N a Silos', descripcion: 'Movimiento interno entre Celda N y silos Kepler.' },
          { codigo: 'E3', nombre: 'Celda 16 -> Celda N', codigoCircuito: 'CIR_05_V03', codigoVuelta: 'VUE_05_V03', tipo: 'movimiento_interno', subtipo: 'transile', destino: 'Celda 16 a Celda N', descripcion: 'Movimiento interno entre Celda 16 y Celda N.' },
        ],
      },
      {
        id: 'nuevos_f',
        nombre: 'Circuitos nuevos',
        color: 'red',
        circuitos: [
          { codigo: 'F1', nombre: 'Carga Silos CHIEF', codigoCircuito: 'CIR_F1', codigoVuelta: 'VUE_F1', tipo: 'despacho', subtipo: 'solidos', destino: 'Silos CHIEF', descripcion: 'Circuito nuevo de carga en silos CHIEF.' },
          { codigo: 'F2', nombre: 'Carga Celda 9', codigoCircuito: 'CIR_F2', codigoVuelta: 'VUE_F2', tipo: 'despacho', subtipo: 'solidos', destino: 'Celda 9', descripcion: 'Circuito nuevo de carga en Celda 9.' },
          { codigo: 'F3', nombre: 'Mov. interno Cargadero 2 -> Silos Kepler', codigoCircuito: 'CIR_F3', codigoVuelta: 'VUE_F3', tipo: 'movimiento_interno', subtipo: 'transile', destino: 'Cargadero 2 a Silos Kepler', descripcion: 'Movimiento interno entre Cargadero 2 y silos Kepler.' },
          { codigo: 'F4', nombre: 'Mov. interno Celda 16 -> Silos Kepler', codigoCircuito: 'CIR_F4', codigoVuelta: 'VUE_F4', tipo: 'movimiento_interno', subtipo: 'transile', destino: 'Celda 16 a Silos Kepler', descripcion: 'Movimiento interno entre Celda 16 y silos Kepler.' },
          { codigo: 'F5', nombre: 'Carga Silo Australiano', codigoCircuito: 'CIR_F5', codigoVuelta: 'VUE_F5', tipo: 'despacho', subtipo: 'solidos', destino: 'Silo Australiano', descripcion: 'Circuito nuevo de carga en silo australiano.' },
        ],
      },
    ],
  },
  san_lorenzo: {
    planta: 'San Lorenzo',
    grupos: [
      { id: 'pendiente_definicion', nombre: 'Circuitos San Lorenzo', color: 'blue', circuitos: [] },
    ],
  },
  avellaneda: {
    planta: 'Avellaneda',
    grupos: [
      { id: 'pendiente_definicion', nombre: 'Circuitos Avellaneda', color: 'blue', circuitos: [] },
    ],
  },
}

export function getCircuitsForSite(siteId: SiteId): MasterCircuitItem[] {
  return MASTER_CIRCUIT_CATALOG[siteId].grupos.flatMap((g) => g.circuitos)
}
