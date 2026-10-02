/**
 * GENERADO por scripts/nodo-sur-sync.mjs desde el modelo de nodos del Nodo Sur.
 * NO EDITAR A MANO: corregir el modelo y regenerar (ver docs/propuesta-en-vivo/CRUCE_NODOS_VS_ETL.md).
 */

export type NodoSurPlant = 'ricardone' | 'san_lorenzo'

export type NodoSurNode = {
  /** `planta:nombre` tal como figura en la matriz. */
  readonly id: string
  readonly plant: NodoSurPlant
  readonly label: string
  /** Código S del nodo (`S6`); null = el modelo no le asigna código. */
  readonly code: string | null
  /** sectorCode con que lo reporta TruckFlow (`2-S6`). */
  readonly feedCode: string | null
  /** Tiene al menos una cámara frontal: el paso se observa. */
  readonly hasCamera: boolean
  /** Playa: área de espera sin cámara propia ni dato del sistema de camiones; se mide por las cámaras de entrada y salida. */
  readonly area: boolean
  /** Capacidad del área en camiones (dato de planta); null si no es área. */
  readonly capacity: number | null
  /** Desvío: no es paso de ningún circuito (Playa demorado). */
  readonly optional: boolean
  readonly devices: readonly string[]
  readonly rearDevices: readonly string[]
}

export type NodoSurCircuitKind = 'recepcion' | 'despacho' | 'transile_interno' | 'transile_externo'

export type NodoSurCircuit = {
  readonly id: string
  readonly kind: NodoSurCircuitKind
  readonly category: string
  readonly label?: string
  readonly plants: readonly NodoSurPlant[]
  /** Secuencia de ids de nodo: el recorrido verdadero, con y sin cámara. */
  readonly nodes: readonly string[]
}

export const NODO_SUR_NODES: readonly NodoSurNode[] = [
  {
    "id": "ricardone:Ingreso",
    "plant": "ricardone",
    "label": "Ingreso",
    "code": "S0",
    "feedCode": "2-S0",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicIngCamFrente"
    ],
    "rearDevices": [
      "RicIngCamTrasera"
    ]
  },
  {
    "id": "ricardone:Pre ingreso",
    "plant": "ricardone",
    "label": "Preingreso",
    "code": "S1",
    "feedCode": "2-S1",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicPreIngInFr",
      "RicPreIngEgFr"
    ],
    "rearDevices": [
      "RicPreIngInTr",
      "RicPreIngEgTr"
    ]
  },
  {
    "id": "ricardone:Calada",
    "plant": "ricardone",
    "label": "Calada",
    "code": "S2",
    "feedCode": "2-S2",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicCal01",
      "RicCal02",
      "RicCal03",
      "RicCal04",
      "RicCal05",
      "RicCal06",
      "RicCalLiq"
    ],
    "rearDevices": []
  },
  {
    "id": "ricardone:Balanza Ingreso",
    "plant": "ricardone",
    "label": "Balanza ingreso",
    "code": "S4",
    "feedCode": "2-S4",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicB1Ingreso",
      "RicB2Ingreso",
      "RicB3Ingreso"
    ],
    "rearDevices": []
  },
  {
    "id": "ricardone:Playa 3",
    "plant": "ricardone",
    "label": "Playa 3",
    "code": "S6",
    "feedCode": "2-S6",
    "hasCamera": true,
    "area": true,
    "capacity": 100,
    "optional": false,
    "devices": [
      "RicS6Playa3"
    ],
    "rearDevices": []
  },
  {
    "id": "ricardone:Celda 16",
    "plant": "ricardone",
    "label": "Celda 16",
    "code": "S5",
    "feedCode": "2-S5",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicC16Carga1",
      "RicC16Carga2",
      "RicC16Descarga1",
      "RicC16Descarga2"
    ],
    "rearDevices": []
  },
  {
    "id": "ricardone:Silo Australiano",
    "plant": "ricardone",
    "label": "Silo Australiano",
    "code": null,
    "feedCode": null,
    "hasCamera": false,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [],
    "rearDevices": []
  },
  {
    "id": "ricardone:Volcable Silo Keppler",
    "plant": "ricardone",
    "label": "Silo Keppler",
    "code": "S7",
    "feedCode": "2-S7",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicS7DescLinea1",
      "RicS7DescLinea2",
      "RicS7Carga"
    ],
    "rearDevices": []
  },
  {
    "id": "ricardone:Volcable Silo Chief",
    "plant": "ricardone",
    "label": "Silo Chief",
    "code": "S8",
    "feedCode": "2-S8",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicS8CargaLinea1",
      "RicS8CargaLinea2"
    ],
    "rearDevices": []
  },
  {
    "id": "ricardone:Tolva de carga Celda 09",
    "plant": "ricardone",
    "label": "Tolva Celda 09",
    "code": null,
    "feedCode": null,
    "hasCamera": false,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [],
    "rearDevices": []
  },
  {
    "id": "ricardone:Tolva de carga Celda 10",
    "plant": "ricardone",
    "label": "Tolva Celda 10",
    "code": null,
    "feedCode": null,
    "hasCamera": false,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [],
    "rearDevices": []
  },
  {
    "id": "ricardone:Tolva de carga Celda 11",
    "plant": "ricardone",
    "label": "Tolva Celda 11",
    "code": null,
    "feedCode": null,
    "hasCamera": false,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [],
    "rearDevices": []
  },
  {
    "id": "ricardone:Tolva de carga silo Chief",
    "plant": "ricardone",
    "label": "Tolva silo Chief",
    "code": "S8",
    "feedCode": "2-S8",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicS8CargaLinea1",
      "RicS8CargaLinea2"
    ],
    "rearDevices": []
  },
  {
    "id": "ricardone:Volcable 1",
    "plant": "ricardone",
    "label": "Volcable 1",
    "code": "S9",
    "feedCode": "2-S9",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicVolcable1"
    ],
    "rearDevices": []
  },
  {
    "id": "ricardone:Volcable 2",
    "plant": "ricardone",
    "label": "Volcable 2",
    "code": "S9",
    "feedCode": "2-S9",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicVolcable2"
    ],
    "rearDevices": []
  },
  {
    "id": "ricardone:Liquidos Carga/Descarga",
    "plant": "ricardone",
    "label": "Líquidos",
    "code": null,
    "feedCode": null,
    "hasCamera": false,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [],
    "rearDevices": []
  },
  {
    "id": "ricardone:Balanza Egreso",
    "plant": "ricardone",
    "label": "Balanza egreso",
    "code": "S4",
    "feedCode": "2-S4",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicB1Egreso",
      "RicB2Egreso",
      "RicB3Egreso"
    ],
    "rearDevices": []
  },
  {
    "id": "ricardone:Playa de egreso",
    "plant": "ricardone",
    "label": "Playa de salida",
    "code": null,
    "feedCode": null,
    "hasCamera": false,
    "area": true,
    "capacity": 4,
    "optional": false,
    "devices": [],
    "rearDevices": []
  },
  {
    "id": "ricardone:Salida 1",
    "plant": "ricardone",
    "label": "Salida 1",
    "code": "S10",
    "feedCode": "2-S10",
    "hasCamera": false,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [],
    "rearDevices": []
  },
  {
    "id": "ricardone:Salida 2",
    "plant": "ricardone",
    "label": "Salida 2",
    "code": "S3",
    "feedCode": "2-S3",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RicEgrCamFrente"
    ],
    "rearDevices": [
      "RicEgrCamTraser"
    ]
  },
  {
    "id": "san_lorenzo:Ingreso",
    "plant": "san_lorenzo",
    "label": "Ingreso",
    "code": "S0",
    "feedCode": "1-S0",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "SLZIngCamFrente"
    ],
    "rearDevices": [
      "SLZIngCamTrasera"
    ]
  },
  {
    "id": "san_lorenzo:Calada",
    "plant": "san_lorenzo",
    "label": "Calada",
    "code": "S2",
    "feedCode": "1-S2",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "SLZCalado",
      "SLZCalCam"
    ],
    "rearDevices": []
  },
  {
    "id": "san_lorenzo:Balanza Ingreso",
    "plant": "san_lorenzo",
    "label": "Balanza ingreso",
    "code": "S1",
    "feedCode": "1-S1",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "SLZBalIngFte"
    ],
    "rearDevices": [
      "SLZBalIngTras"
    ]
  },
  {
    "id": "san_lorenzo:Carga / Descarga OSL",
    "plant": "san_lorenzo",
    "label": "Carga OSL",
    "code": "S10",
    "feedCode": "1-S10",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "RenCargFte",
      "RenDescFte"
    ],
    "rearDevices": [
      "RenCargTras",
      "RenDescTras"
    ]
  },
  {
    "id": "san_lorenzo:Playa OSL",
    "plant": "san_lorenzo",
    "label": "Playa OSL",
    "code": "S3",
    "feedCode": "1-S3",
    "hasCamera": false,
    "area": true,
    "capacity": 150,
    "optional": false,
    "devices": [],
    "rearDevices": []
  },
  {
    "id": "san_lorenzo:Plataformas Volcables",
    "plant": "san_lorenzo",
    "label": "Volcables",
    "code": "S4",
    "feedCode": "1-S4",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "SLZVolcableC1",
      "SLZVolcableC2",
      "SLZVolcableC3",
      "SLZVolcableC4",
      "SLZVolcableC5",
      "SLZDescCam"
    ],
    "rearDevices": []
  },
  {
    "id": "san_lorenzo:Cargadero",
    "plant": "san_lorenzo",
    "label": "Cargadero",
    "code": null,
    "feedCode": null,
    "hasCamera": false,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [],
    "rearDevices": []
  },
  {
    "id": "san_lorenzo:Carga/descarga",
    "plant": "san_lorenzo",
    "label": "Carga y descarga",
    "code": "S6",
    "feedCode": "1-S6",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "SLZBalLiq1a",
      "SLZBalLiq1b",
      "SLZBalLiq2a",
      "SLZBalLiq2b"
    ],
    "rearDevices": []
  },
  {
    "id": "san_lorenzo:Balanza Egreso",
    "plant": "san_lorenzo",
    "label": "Balanza egreso",
    "code": "S5",
    "feedCode": "1-S5",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "SLZBalSC1Fte",
      "SLZBalSC2Fte"
    ],
    "rearDevices": [
      "SLZBalSC1Tras",
      "SLZBalSC2Tras"
    ]
  },
  {
    "id": "san_lorenzo:Carga/Descarga Renova",
    "plant": "san_lorenzo",
    "label": "Renova",
    "code": "S8",
    "feedCode": "1-S8",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "SLZTK400"
    ],
    "rearDevices": []
  },
  {
    "id": "san_lorenzo:Egreso",
    "plant": "san_lorenzo",
    "label": "Egreso",
    "code": "S7",
    "feedCode": "1-S7",
    "hasCamera": true,
    "area": false,
    "capacity": null,
    "optional": false,
    "devices": [
      "SLZSalidaC1Fte",
      "SLZSalidaC2Fte"
    ],
    "rearDevices": [
      "SLZSalidaC1Tras",
      "SLZSalidaC2Tras"
    ]
  },
  {
    "id": "ricardone:Playa 1",
    "plant": "ricardone",
    "label": "Playa 1",
    "code": null,
    "feedCode": null,
    "hasCamera": false,
    "area": true,
    "capacity": 300,
    "optional": false,
    "devices": [],
    "rearDevices": []
  },
  {
    "id": "ricardone:Playa demorado",
    "plant": "ricardone",
    "label": "Playa demorado",
    "code": null,
    "feedCode": null,
    "hasCamera": false,
    "area": true,
    "capacity": 20,
    "optional": true,
    "devices": [],
    "rearDevices": []
  }
]

export const NODO_SUR_CIRCUITS: readonly NodoSurCircuit[] = [
  {
    "id": "R1",
    "kind": "recepcion",
    "category": "Recepción",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Celda 16",
      "ricardone:Playa 3",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R2",
    "kind": "recepcion",
    "category": "Recepción",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Silo Australiano",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R3",
    "kind": "recepcion",
    "category": "Recepción",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable Silo Keppler",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R4",
    "kind": "recepcion",
    "category": "Recepción",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable Silo Chief",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R5",
    "kind": "recepcion",
    "category": "Recepción",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable 1",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R6",
    "kind": "recepcion",
    "category": "Recepción",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable 2",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R7",
    "kind": "recepcion",
    "category": "Recepción",
    "plants": [
      "ricardone",
      "san_lorenzo"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Salida 2",
      "san_lorenzo:Ingreso",
      "san_lorenzo:Playa OSL",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "R8",
    "kind": "recepcion",
    "category": "Recepción",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Liquidos Carga/Descarga",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R9",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Celda 16",
      "ricardone:Playa 3",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2"
    ]
  },
  {
    "id": "R10",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Silo Australiano",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2"
    ]
  },
  {
    "id": "R11",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable Silo Keppler",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2"
    ]
  },
  {
    "id": "R12",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Tolva de carga silo Chief",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2"
    ]
  },
  {
    "id": "R13",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Tolva de carga Celda 09",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2"
    ]
  },
  {
    "id": "R14",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Tolva de carga Celda 10",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2"
    ]
  },
  {
    "id": "R15",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Tolva de carga Celda 11",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2"
    ]
  },
  {
    "id": "R16",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Liquidos Carga/Descarga",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2"
    ]
  },
  {
    "id": "R17",
    "kind": "transile_interno",
    "category": "Transile interno",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Celda 16",
      "ricardone:Volcable Silo Chief",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R18",
    "kind": "transile_interno",
    "category": "Transile interno",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Celda 16",
      "ricardone:Volcable Silo Keppler",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R19",
    "kind": "transile_interno",
    "category": "Transile interno",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Celda 16",
      "ricardone:Volcable 1",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R20",
    "kind": "transile_interno",
    "category": "Transile interno",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Celda 16",
      "ricardone:Volcable 2",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R21",
    "kind": "transile_interno",
    "category": "Transile interno",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Tolva de carga silo Chief",
      "ricardone:Celda 16",
      "ricardone:Playa 3",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R22",
    "kind": "transile_interno",
    "category": "Transile interno",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Tolva de carga silo Chief",
      "ricardone:Volcable 1",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R23",
    "kind": "transile_interno",
    "category": "Transile interno",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable Silo Keppler",
      "ricardone:Celda 16",
      "ricardone:Playa 3",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R24",
    "kind": "transile_interno",
    "category": "Transile interno",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable Silo Keppler",
      "ricardone:Volcable 1",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R25",
    "kind": "transile_interno",
    "category": "Transile interno",
    "plants": [
      "ricardone"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable Silo Keppler",
      "ricardone:Volcable 2",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "R26",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "ricardone",
      "san_lorenzo"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Celda 16",
      "ricardone:Playa 3",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2",
      "san_lorenzo:Ingreso",
      "san_lorenzo:Playa OSL",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "R27",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "ricardone",
      "san_lorenzo"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Silo Australiano",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2",
      "san_lorenzo:Ingreso",
      "san_lorenzo:Playa OSL",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "R28",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "ricardone",
      "san_lorenzo"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable Silo Keppler",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2",
      "san_lorenzo:Ingreso",
      "san_lorenzo:Playa OSL",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "R29",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "ricardone",
      "san_lorenzo"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Tolva de carga silo Chief",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2",
      "san_lorenzo:Ingreso",
      "san_lorenzo:Playa OSL",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "R30",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "ricardone",
      "san_lorenzo"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Tolva de carga Celda 09",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2",
      "san_lorenzo:Ingreso",
      "san_lorenzo:Playa OSL",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "R31",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "ricardone",
      "san_lorenzo"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Tolva de carga Celda 10",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2",
      "san_lorenzo:Ingreso",
      "san_lorenzo:Playa OSL",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "R32",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "ricardone",
      "san_lorenzo"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Tolva de carga Celda 11",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2",
      "san_lorenzo:Ingreso",
      "san_lorenzo:Playa OSL",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "R33",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "ricardone",
      "san_lorenzo"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Liquidos Carga/Descarga",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2",
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Carga / Descarga OSL",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "R34",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "ricardone",
      "san_lorenzo"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Liquidos Carga/Descarga",
      "ricardone:Balanza Egreso",
      "ricardone:Calada",
      "ricardone:Salida 2",
      "san_lorenzo:Ingreso",
      "san_lorenzo:Playa OSL",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Carga/descarga",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "R35",
    "kind": "recepcion",
    "category": "Recepción",
    "label": "Calada Ricardone → descarga líquidos puerto",
    "plants": [
      "ricardone",
      "san_lorenzo"
    ],
    "nodes": [
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Salida 2",
      "san_lorenzo:Ingreso",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Carga/descarga",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "SL1",
    "kind": "recepcion",
    "category": "Recepción",
    "plants": [
      "san_lorenzo"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Carga / Descarga OSL",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "SL2",
    "kind": "recepcion",
    "category": "Recepción",
    "plants": [
      "san_lorenzo"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Playa OSL",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Carga/descarga",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "SL3",
    "kind": "recepcion",
    "category": "Recepción",
    "plants": [
      "san_lorenzo"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Playa OSL",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Carga/Descarga Renova",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "SL4",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "san_lorenzo"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Cargadero",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "SL5",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "san_lorenzo"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Carga / Descarga OSL",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "SL6",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "san_lorenzo"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Carga/Descarga Renova",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "SL7",
    "kind": "despacho",
    "category": "Despacho",
    "plants": [
      "san_lorenzo"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Carga/descarga",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso"
    ]
  },
  {
    "id": "SL8",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "san_lorenzo",
      "ricardone"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Cargadero",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso",
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Celda 16",
      "ricardone:Playa 3",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "SL9",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "san_lorenzo",
      "ricardone"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Cargadero",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso",
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Silo Australiano",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "SL10",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "san_lorenzo",
      "ricardone"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Cargadero",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso",
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable Silo Keppler",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "SL11",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "san_lorenzo",
      "ricardone"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Cargadero",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso",
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable Silo Chief",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "SL12",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "san_lorenzo",
      "ricardone"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Cargadero",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso",
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable 1",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "SL13",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "san_lorenzo",
      "ricardone"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Plataformas Volcables",
      "san_lorenzo:Cargadero",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso",
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Playa 3",
      "ricardone:Volcable 2",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "SL14",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "san_lorenzo",
      "ricardone"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Carga / Descarga OSL",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso",
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Liquidos Carga/Descarga",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  },
  {
    "id": "SL15",
    "kind": "transile_externo",
    "category": "Transile externo",
    "plants": [
      "san_lorenzo",
      "ricardone"
    ],
    "nodes": [
      "san_lorenzo:Ingreso",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Ingreso",
      "san_lorenzo:Carga/descarga",
      "san_lorenzo:Calada",
      "san_lorenzo:Balanza Egreso",
      "san_lorenzo:Egreso",
      "ricardone:Ingreso",
      "ricardone:Pre ingreso",
      "ricardone:Playa 1",
      "ricardone:Calada",
      "ricardone:Balanza Ingreso",
      "ricardone:Liquidos Carga/Descarga",
      "ricardone:Balanza Egreso",
      "ricardone:Playa de egreso",
      "ricardone:Salida 1"
    ]
  }
]
