import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { IFCLoader } from "web-ifc-three/IFCLoader"

interface IfcViewerProps {
  file: File | null
  plant?: PlantId
  onFleetChange?: (fleet: IfcSelectedTruckInfo[]) => void
  operationFilter?: "ALL" | IfcSelectedTruckInfo["operationType"]
}

export type PlantId = "RICARDONE" | "SAN_LORENZO" | "AVELLANEDA"

interface CircuitDefinition {
  prefix: string
  label: string
  plant: PlantId
  group: "DESCARGA" | "CARGA" | "MOVIMIENTO_INTERNO" | "SAN_LORENZO"
  CIR: string
  VUE: string
  PTD: string
  PTC: string
}


const RICARDONE_ORDER = ["A1", "A2", "A3", "A4", "A5", "A7", "B1", "B2", "B4", "B5", "C1", "D1", "E01", "E02", "F1", "F2", "F3", "F4", "F5", "F6"]
const SAN_LORENZO_ORDER = ["A1", "B1", "C1", "C2", "C3", "D1", "D2", "D3", "E01", "E02", "E03"]

const CIRCUITS: CircuitDefinition[] = [
  { prefix: "A1", label: "A1 Descarga Celda 16", plant: "RICARDONE", group: "DESCARGA", CIR: "CIR_01_V01", VUE: "VUE_01_V01", PTD: "PTD_A1_V01", PTC: "PTC_A1_V01" },
  { prefix: "A2", label: "A2 Descarga Silo Australiano", plant: "RICARDONE", group: "DESCARGA", CIR: "CIR_01_V02", VUE: "VUE_01_V02", PTD: "PTD_A2_V02", PTC: "PTC_A2_V02" },
  { prefix: "A3", label: "A3 Descarga Silos", plant: "RICARDONE", group: "DESCARGA", CIR: "CIR_01_V03", VUE: "VUE_01_V03", PTD: "PTD_A3_V03", PTC: "PTC_A3_V03" },
  { prefix: "A4", label: "A4 Descarga Volcable 1", plant: "RICARDONE", group: "DESCARGA", CIR: "CIR_01_V04", VUE: "VUE_01_V04", PTD: "PTD_A4_V04", PTC: "PTC_A4_V04" },
  { prefix: "A5", label: "A5 Descarga Volcable 2", plant: "RICARDONE", group: "DESCARGA", CIR: "CIR_01_V05", VUE: "VUE_01_V05", PTD: "PTD_A5_V05", PTC: "PTC_A5_V05" },
  { prefix: "A7", label: "A7 Descarga San Lorenzo", plant: "RICARDONE", group: "DESCARGA", CIR: "CIR_06_V01", VUE: "VUE_06_V01", PTD: "PTD_A7_V01", PTC: "PTC_A7_V01" },
  { prefix: "B1", label: "B1 Carga Celda 16", plant: "RICARDONE", group: "CARGA", CIR: "CIR_02_V01", VUE: "VUE_02_V01", PTD: "PTD_B1_V01", PTC: "PTC_B1_V01" },
  { prefix: "B2", label: "B2 Carga Silos", plant: "RICARDONE", group: "CARGA", CIR: "CIR_02_V03", VUE: "VUE_02_V03", PTD: "PTD_B2_V03", PTC: "PTC_B2_V03" },
  { prefix: "B4", label: "B4 Carga Cargadero 1", plant: "RICARDONE", group: "CARGA", CIR: "CIR_02_V04", VUE: "VUE_02_V04", PTD: "PTD_B4_V04", PTC: "PTC_B4_V04" },
  { prefix: "B5", label: "B5 Carga Celda 9", plant: "RICARDONE", group: "CARGA", CIR: "CIR_02_V05", VUE: "VUE_02_V05", PTD: "PTD_B5_V05", PTC: "PTC_B5_V05" },
  { prefix: "C1", label: "C1 Descarga liquido", plant: "RICARDONE", group: "DESCARGA", CIR: "CIR_03_V01", VUE: "VUE_03_V01", PTD: "PTD_C1_V01", PTC: "PTC_C1_V01" },
  { prefix: "D1", label: "D1 Carga liquido", plant: "RICARDONE", group: "CARGA", CIR: "CIR_04_V01", VUE: "VUE_04_V01", PTD: "PTD_D1_V01", PTC: "PTC_D1_V01" },
  { prefix: "E01", label: "E01 Celda 16 -> Volcable 1", plant: "RICARDONE", group: "MOVIMIENTO_INTERNO", CIR: "CIR_05_V01", VUE: "VUE_05_V01", PTD: "PTD_E01_V01", PTC: "PTC_E01_V01" },
  { prefix: "E02", label: "E02 Silos -> Volcable 1", plant: "RICARDONE", group: "MOVIMIENTO_INTERNO", CIR: "CIR_05_V02", VUE: "VUE_05_V02", PTD: "PTD_E02_V02", PTC: "PTC_E02_V02" },
  { prefix: "F1", label: "F1 Carga Silos CHIEF", plant: "RICARDONE", group: "CARGA", CIR: "CIR_07_V01", VUE: "VUE_07_V01", PTD: "PTD_F1_V01", PTC: "PTC_F1_V01" },
  { prefix: "F2", label: "F2 Carga Celda 11", plant: "RICARDONE", group: "CARGA", CIR: "CIR_07_V02", VUE: "VUE_07_V02", PTD: "PTD_F2_V02", PTC: "PTC_F2_V02" },
  { prefix: "F3", label: "F3 Transile Silos CHIEF -> Celda 16", plant: "RICARDONE", group: "MOVIMIENTO_INTERNO", CIR: "CIR_08_V01", VUE: "VUE_08_V01", PTD: "PTD_F3_V01", PTC: "PTC_F3_V01" },
  { prefix: "F4", label: "F4 Mov interno Celda 16 -> Silos Kepler", plant: "RICARDONE", group: "MOVIMIENTO_INTERNO", CIR: "CIR_08_V02", VUE: "VUE_08_V02", PTD: "PTD_F4_V01", PTC: "PTC_F4_V01" },
  { prefix: "F5", label: "F5 Carga Silo Australiano", plant: "RICARDONE", group: "CARGA", CIR: "CIR_07_V03", VUE: "VUE_07_V03", PTD: "PTD_F5_V03", PTC: "PTC_F5_V03" },
  { prefix: "F6", label: "F6 Transile Silos Kepler -> Celda 16", plant: "RICARDONE", group: "MOVIMIENTO_INTERNO", CIR: "CIR_08_V03", VUE: "VUE_08_V03", PTD: "PTD_F6_V01", PTC: "PTC_F6_V01" },
  { prefix: "A1", label: "SL A1 Descarga solido", plant: "SAN_LORENZO", group: "SAN_LORENZO", CIR: "CIR_01_V01", VUE: "VUE_01_V01", PTD: "PTD_A1_V01", PTC: "PTC_A1_V01" },
  { prefix: "B1", label: "SL B1 Carga Celda 16", plant: "SAN_LORENZO", group: "SAN_LORENZO", CIR: "CIR_02_V01", VUE: "VUE_02_V01", PTD: "PTD_B1_V01", PTC: "PTC_B1_V01" },
  { prefix: "C1", label: "SL C1 Descarga liquido 1", plant: "SAN_LORENZO", group: "SAN_LORENZO", CIR: "CIR_03_V01", VUE: "VUE_03_V01", PTD: "PTD_C1_V01", PTC: "PTC_C1_V01" },
  { prefix: "C2", label: "SL C2 Descarga liquido 2", plant: "SAN_LORENZO", group: "SAN_LORENZO", CIR: "CIR_03_V02", VUE: "VUE_03_V02", PTD: "PTD_C2_V02", PTC: "PTC_C2_V02" },
  { prefix: "C3", label: "SL C3 Descarga liquido 3", plant: "SAN_LORENZO", group: "SAN_LORENZO", CIR: "CIR_03_V03", VUE: "VUE_03_V03", PTD: "PTD_C3_V03", PTC: "PTC_C3_V03" },
  { prefix: "D1", label: "SL D1 Carga liquido 1", plant: "SAN_LORENZO", group: "SAN_LORENZO", CIR: "CIR_04_V01", VUE: "VUE_04_V01", PTD: "PTD_D1_V01", PTC: "PTC_D1_V01" },
  { prefix: "D2", label: "SL D2 Carga liquido 2", plant: "SAN_LORENZO", group: "SAN_LORENZO", CIR: "CIR_04_V02", VUE: "VUE_04_V02", PTD: "PTD_D2_V02", PTC: "PTC_D2_V02" },
  { prefix: "D3", label: "SL D3 Carga liquido 3", plant: "SAN_LORENZO", group: "SAN_LORENZO", CIR: "CIR_04_V03", VUE: "VUE_04_V03", PTD: "PTD_D3_V03", PTC: "PTC_D3_V03" },
  { prefix: "E01", label: "SL E01 Celda 16 -> Volcable 1", plant: "SAN_LORENZO", group: "SAN_LORENZO", CIR: "CIR_05_V01", VUE: "VUE_05_V01", PTD: "PTD_E01_V01", PTC: "PTC_E01_V01" },
  { prefix: "E02", label: "SL E02 Silos -> Volcable 1", plant: "SAN_LORENZO", group: "SAN_LORENZO", CIR: "CIR_05_V02", VUE: "VUE_05_V02", PTD: "PTD_E02_V02", PTC: "PTC_E02_V02" },
  { prefix: "E03", label: "SL E03 Cargadero 1 -> Volcable 1", plant: "SAN_LORENZO", group: "SAN_LORENZO", CIR: "CIR_05_V03", VUE: "VUE_05_V03", PTD: "PTD_E03_V03", PTC: "PTC_E03_V03" },
]

function mixTagFromCirVue(token: string): string | null {
  const match = token.match(/^(?:CIR|VUE)_(\d+_V\d+)$/i)
  return match ? `MIX_${match[1]}` : null
}

function circuitCodes(c: CircuitDefinition): string[] {
  const base = [c.CIR, c.VUE, c.PTD, c.PTC].filter(Boolean)
  const extraMix = mixTagFromCirVue(c.CIR)
  return extraMix ? [...base, extraMix] : base
}

interface CircuitColorBuckets {
  camino: number[]
  caminoVacio: number[]
  mixto: number[]
  puntoDescarga: number[]
  puntoCarga: number[]
}

interface ElementDebugInfo {
  expressId: number
  commentsCandidates: string[]
  ifcComments: string[]
  codesFound: string[]
}

export interface IfcSelectedTruckInfo {
  plate: string
  cargoType: string
  driverName: string
  lastCheckpoint: string
  operationType: "RECEPCION" | "DESPACHANDO" | "TRANSILE"
  assignedCircuitPrefix: string
  assignedCircuitLabel: string
  assignedCIR: string
  assignedVUE: string
  assignedPTD: string
  assignedPTC: string
  locationExpressId: number
  cameraImageUrl: string
}

interface FleetStats {
  enPlanta: number
  despachando: number
  recepcion: number
  transile: number
}

interface CircuitDebugInfo {
  activePrefix: string
  searchCir: string
  searchVue: string
  searchPointCodes: string[]
  foundCir: number
  foundVue: number
  foundPtd: number
  foundPtc: number
}

const EMPTY_BUCKETS: CircuitColorBuckets = {
  camino: [],
  caminoVacio: [],
  mixto: [],
  puntoDescarga: [],
  puntoCarga: [],
}

const TRUCK_LOCATION_EXPRESS_IDS = [126491, 126511, 130191, 129138, 127321]
const FLEET_TRUCK_COUNT = 50
const TRUCK_CARGO_TYPES = ["Maiz", "Soja", "Harina", "Aceite", "Girasol", "Trigo"] as const
const TRUCK_CHECKPOINTS = ["Porteria Norte", "Balanza 1", "Playa descarga", "Balanza 2", "Salida"] as const

function tagMatchesCode(tag: string, code: string): boolean {
  const t = tag.toUpperCase().trim()
  const c = code.toUpperCase().trim()
  if (!c) return false
  if (t === c) return true
  // Soporta casos tipo PTD_A1_V01 cuando el mapeo base viene como PTD_A1
  if ((c.startsWith("PTD_") || c.startsWith("PTC_")) && t.startsWith(`${c}_`)) return true
  return false
}

function buildMockPlate(index: number): string {
  return `SIM-${String(index + 1).padStart(3, "0")}`
}

function buildCameraSnapshotDataUrl(plate: string, cargoType: string, lastCheckpoint: string): string {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#334155"/>
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#g)"/>
    <rect x="18" y="18" width="604" height="324" rx="10" fill="#0b1220" stroke="#64748b" stroke-width="2"/>
    <text x="32" y="48" fill="#93c5fd" font-size="18" font-family="Arial, sans-serif">CAM-PLANTA-01</text>
    <text x="32" y="86" fill="#e2e8f0" font-size="24" font-family="Arial, sans-serif">${plate}</text>
    <text x="32" y="120" fill="#cbd5e1" font-size="16" font-family="Arial, sans-serif">Carga: ${cargoType}</text>
    <text x="32" y="148" fill="#cbd5e1" font-size="16" font-family="Arial, sans-serif">Ultimo check: ${lastCheckpoint}</text>
    <circle cx="566" cy="54" r="8" fill="#ef4444"/>
    <text x="584" y="60" fill="#fecaca" font-size="12" font-family="Arial, sans-serif">REC</text>
    <rect x="210" y="190" width="220" height="95" rx="8" fill="#1e293b" stroke="#60a5fa" stroke-width="2"/>
    <text x="320" y="247" text-anchor="middle" fill="#bfdbfe" font-size="30" font-family="Arial, sans-serif">${plate}</text>
  </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function buildSimTruckInfo(index: number, locationExpressId: number): IfcSelectedTruckInfo {
  const plate = buildMockPlate(index)
  const cargoType = TRUCK_CARGO_TYPES[index % TRUCK_CARGO_TYPES.length]
  const lastCheckpoint = TRUCK_CHECKPOINTS[index % TRUCK_CHECKPOINTS.length]
  const availableCircuits = RICARDONE_ORDER
    .map((prefix) => CIRCUITS.find((c) => c.plant === "RICARDONE" && c.prefix === prefix))
    .filter((c): c is CircuitDefinition => Boolean(c))
  const assignedCircuit = availableCircuits[index % availableCircuits.length] ?? CIRCUITS[0]
  const operationType =
    assignedCircuit.group === "DESCARGA"
      ? "RECEPCION"
      : assignedCircuit.group === "CARGA"
        ? "DESPACHANDO"
        : "TRANSILE"
  return {
    plate,
    cargoType,
    driverName: `Chofer ${String(index + 1).padStart(2, "0")}`,
    lastCheckpoint,
    operationType,
    assignedCircuitPrefix: assignedCircuit.prefix,
    assignedCircuitLabel: assignedCircuit.label,
    assignedCIR: assignedCircuit.CIR,
    assignedVUE: assignedCircuit.VUE,
    assignedPTD: assignedCircuit.PTD,
    assignedPTC: assignedCircuit.PTC,
    locationExpressId,
    cameraImageUrl: buildCameraSnapshotDataUrl(plate, cargoType, lastCheckpoint),
  }
}

function createTruckCircleTexture(plate: string, operationType: IfcSelectedTruckInfo["operationType"]): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    const fallbackCanvas = document.createElement("canvas")
    fallbackCanvas.width = 2
    fallbackCanvas.height = 2
    const fallbackCtx = fallbackCanvas.getContext("2d")
    if (fallbackCtx) {
      fallbackCtx.fillStyle = "#60a5fa"
      fallbackCtx.fillRect(0, 0, 2, 2)
    }
    const fallback = new THREE.CanvasTexture(fallbackCanvas)
    fallback.needsUpdate = true
    return fallback
  }

  ctx.clearRect(0, 0, size, size)
  const fill =
    operationType === "RECEPCION"
      ? "#0ea5e9"
      : operationType === "DESPACHANDO"
        ? "#22c55e"
        : "#8b5cf6"
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, 96, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = "#ffffff"
  ctx.stroke()

  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 34px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(plate, size / 2, size / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function extractCodesFromText(text: string): string[] {
  const regex = /\b(?:CIR|VUE|PTD|PTC|MIX)_[A-Z0-9]+(?:_V\d+)?\b/gi
  const out = text.match(regex) ?? []
  return out.map((x) => x.toUpperCase())
}

function unwrapIfcText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return unwrapIfcText((value as Record<string, unknown>).value)
  }
  return null
}

function extractCodesFromUnknown(value: unknown): string[] {
  const text = unwrapIfcText(value)
  if (!text) return []
  return extractCodesFromText(text)
}

function extractCodesDeep(value: unknown, seen = new Set<unknown>()): string[] {
  if (value == null) return []
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return extractCodesFromText(String(value))
  }
  if (typeof value !== "object") return []
  if (seen.has(value)) return []
  seen.add(value)
  const out: string[] = []
  for (const v of Object.values(value as Record<string, unknown>)) {
    out.push(...extractCodesDeep(v, seen))
  }
  return out
}

function isCommentPropertyName(name: string | null): boolean {
  if (!name) return false
  const n = name.trim().toUpperCase()
  return n.includes("COMMENT") || n.includes("COMENT")
}

function refToExpressId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    const inner = (value as Record<string, unknown>).value
    if (typeof inner === "number" && Number.isFinite(inner)) return inner
  }
  return null
}

async function readElementDebugInfo(
  loader: IFCLoader,
  model: THREE.Object3D & { modelID?: number },
  expressId: number
): Promise<ElementDebugInfo> {
  const out: ElementDebugInfo = {
    expressId,
    commentsCandidates: [],
    ifcComments: [],
    codesFound: [],
  }
  if (model.modelID == null) return out
  const ifc = loader.ifcManager as unknown as {
    getItemProperties: (modelID: number, id: number, recursive?: boolean) => Promise<unknown> | unknown
    getPropertySets?: (modelID: number, id: number, recursive?: boolean) => Promise<unknown> | unknown
  }
  const codeBag = new Set<string>()
  const commentsBag = new Set<string>()
  const explicitIfcComments = new Set<string>()

  try {
    const props = await ifc.getItemProperties(model.modelID, expressId, true)
    const propsObj = (props ?? {}) as Record<string, unknown>
    for (const key of ["Name", "Description", "Tag", "LongName", "ObjectType"]) {
      const txt = unwrapIfcText(propsObj[key])
      if (!txt) continue
      commentsBag.add(`${key}: ${txt}`)
      for (const c of extractCodesFromText(txt)) codeBag.add(c)
    }
  } catch {
    // ignore
  }

  if (ifc.getPropertySets) {
    try {
      const psets = await ifc.getPropertySets(model.modelID, expressId, true)
      const psetsArr = Array.isArray(psets) ? psets : []
      for (const psetRaw of psetsArr) {
        const psetObj = psetRaw as Record<string, unknown>
        const psetName = unwrapIfcText(psetObj.Name) ?? "Pset"
        const propsList = Array.isArray(psetObj.HasProperties) ? psetObj.HasProperties : []
        for (const propRaw of propsList) {
          let propObj: Record<string, unknown> | null = null
          if (typeof propRaw === "object" && propRaw != null) {
            propObj = propRaw as Record<string, unknown>
          } else {
            const propId = refToExpressId(propRaw)
            if (propId != null) {
              try {
                const resolved = await ifc.getItemProperties(model.modelID, propId, true)
                if (resolved && typeof resolved === "object") propObj = resolved as Record<string, unknown>
              } catch {
                // ignore
              }
            }
          }
          if (!propObj) continue
          const propName = unwrapIfcText(propObj.Name) ?? "(sin nombre)"
          const candidateValues = [
            unwrapIfcText(propObj.NominalValue),
            unwrapIfcText(propObj.Description),
            unwrapIfcText(propObj.value),
          ].filter((v): v is string => Boolean(v))
          for (const val of candidateValues) {
            if (isCommentPropertyName(propName)) {
              explicitIfcComments.add(`${psetName}.${propName}: ${val}`)
            }
            if (isCommentPropertyName(propName) || extractCodesFromText(val).length > 0) {
              commentsBag.add(`${psetName}.${propName}: ${val}`)
            }
            for (const c of extractCodesFromText(val)) codeBag.add(c)
          }
        }
      }
    } catch {
      // ignore
    }
  }
  out.commentsCandidates = [...commentsBag].slice(0, 12)
  out.ifcComments = [...explicitIfcComments].slice(0, 12)
  out.codesFound = [...codeBag]
  return out
}

function extractExpressIdsFromModel(model: THREE.Object3D): number[] {
  const ids = new Set<number>()
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const attr = mesh.geometry.getAttribute("expressID") as THREE.BufferAttribute | undefined
    if (!attr) return
    for (let i = 0; i < attr.count; i++) {
      const id = Number(attr.getX(i))
      if (Number.isFinite(id)) ids.add(id)
    }
  })
  return [...ids]
}

function buildExpressPointMap(model: THREE.Object3D): Record<number, THREE.Vector3> {
  const sums: Record<number, { x: number; y: number; z: number; n: number }> = {}
  model.updateMatrixWorld(true)
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const geom = mesh.geometry as THREE.BufferGeometry
    const expressAttr = geom.getAttribute("expressID") as THREE.BufferAttribute | undefined
    const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | undefined
    if (!expressAttr || !posAttr) return
    const tmp = new THREE.Vector3()
    const step = Math.max(1, Math.floor(posAttr.count / 8000))
    for (let i = 0; i < posAttr.count; i += step) {
      const expressId = Number(expressAttr.getX(i))
      if (!Number.isFinite(expressId)) continue
      tmp.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(mesh.matrixWorld)
      if (!sums[expressId]) sums[expressId] = { x: 0, y: 0, z: 0, n: 0 }
      sums[expressId].x += tmp.x
      sums[expressId].y += tmp.y
      sums[expressId].z += tmp.z
      sums[expressId].n += 1
    }
  })
  const points: Record<number, THREE.Vector3> = {}
  for (const [idStr, s] of Object.entries(sums)) {
    if (s.n === 0) continue
    points[Number(idStr)] = new THREE.Vector3(s.x / s.n, s.y / s.n, s.z / s.n)
  }
  return points
}

async function buildIfcTagsMap(
  loader: IFCLoader,
  model: THREE.Object3D & { modelID?: number }
): Promise<Record<number, string[]>> {
  if (model.modelID == null) return {}
  const ifc = loader.ifcManager as unknown as {
    getItemProperties: (modelID: number, id: number, recursive?: boolean) => Promise<unknown> | unknown
    getPropertySets?: (modelID: number, id: number, recursive?: boolean) => Promise<unknown> | unknown
  }
  const ids = extractExpressIdsFromModel(model)
  const result: Record<number, string[]> = {}
  const chunk = 20
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    await Promise.all(slice.map(async (id) => {
      const bag = new Set<string>()
      try {
        const props = await ifc.getItemProperties(model.modelID as number, id, true)
        // Fallback: algunos IFC guardan códigos directo en atributos de instancia.
        for (const code of extractCodesDeep(props)) bag.add(code)
        for (const code of extractCodesFromUnknown((props as Record<string, unknown>)?.Description)) bag.add(code)
        for (const code of extractCodesFromUnknown((props as Record<string, unknown>)?.Tag)) bag.add(code)
        for (const code of extractCodesFromUnknown((props as Record<string, unknown>)?.Name)) bag.add(code)
      } catch {
        // Ignorar errores de lectura de propiedades sueltas.
      }
      if (ifc.getPropertySets) {
        try {
          const psets = await ifc.getPropertySets(model.modelID as number, id, true)
          const psetsArr = Array.isArray(psets) ? psets : []
          for (const psetRaw of psetsArr) {
            const psetObj = psetRaw as Record<string, unknown>
            const propsList = Array.isArray(psetObj.HasProperties) ? psetObj.HasProperties : []
            for (const propRaw of propsList) {
              let propObj: Record<string, unknown> | null = null
              if (typeof propRaw === "object" && propRaw != null) {
                propObj = propRaw as Record<string, unknown>
              } else {
                const propId = refToExpressId(propRaw)
                if (propId != null) {
                  try {
                    const resolved = await ifc.getItemProperties(model.modelID as number, propId, true)
                    if (resolved && typeof resolved === "object") propObj = resolved as Record<string, unknown>
                  } catch {
                    // Ignorar referencia inválida.
                  }
                }
              }
              if (!propObj) continue
              const propName = unwrapIfcText(propObj.Name)
              if (!isCommentPropertyName(propName)) continue
              for (const code of extractCodesFromUnknown(propObj.NominalValue)) bag.add(code)
              for (const code of extractCodesFromUnknown(propObj.Description)) bag.add(code)
              for (const code of extractCodesFromUnknown(propObj.value)) bag.add(code)
            }
          }
        } catch {
          // Ignorar errores de lectura de property sets.
        }
      }
      const tags = [...bag]
      if (tags.length > 0) result[id] = tags
    }))
  }
  return result
}

export function IfcViewer({ file, plant = "RICARDONE", onFleetChange, operationFilter = "ALL" }: IfcViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const ifcLoaderRef = useRef<IFCLoader | null>(null)
  const ifcModelRef = useRef<THREE.Object3D | null>(null)
  const expressPointMapRef = useRef<Record<number, THREE.Vector3>>({})
  const simTimerRef = useRef<number | null>(null)
  const truckMarkersRef = useRef<THREE.Sprite[]>([])
  const truckMarkerDataRef = useRef<Map<THREE.Object3D, IfcSelectedTruckInfo>>(new Map())
  const hiddenBaseMaterialRef = useRef<THREE.MeshLambertMaterial>(
    new THREE.MeshLambertMaterial({
      color: 0xe5e7eb,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
  )
  const hiddenEdgeMaterialRef = useRef<THREE.LineBasicMaterial>(new THREE.LineBasicMaterial({ color: 0x64748b }))
  const caminoMaterialRef = useRef<THREE.Material>(new THREE.MeshBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0.98, depthTest: false }))
  const caminoVacioMaterialRef = useRef<THREE.Material>(new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.99, depthTest: false }))
  const mixtoMaterialRef = useRef<THREE.Material>(new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 1, depthTest: false }))
  const puntoDescMaterialRef = useRef<THREE.Material>(new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 1, depthTest: false }))
  const puntoCargaMaterialRef = useRef<THREE.Material>(new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 1, depthTest: false }))
  const truckStepMaterialRef = useRef<THREE.Material>(new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 1, depthTest: true }))
  const initialTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 2, 0))
  const initialPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(18, 16, 20))
  const raycasterRef = useRef(new THREE.Raycaster())
  const elementTagsRef = useRef<Record<number, string[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null)
  const [stats, setStats] = useState<{ meshes: number; triangles: number } | null>(null)
  const [autoOrbit, setAutoOrbit] = useState(false)
  const [selectedElementIds, setSelectedElementIds] = useState<number[]>([])
  const [lastPickedId, setLastPickedId] = useState<number | null>(null)
  const [activeCircuitPrefix, setActiveCircuitPrefix] = useState<string | null>(null)
  const [circuitBuckets, setCircuitBuckets] = useState<CircuitColorBuckets>(EMPTY_BUCKETS)
  const [searchText, setSearchText] = useState("")
  const [elementTagsById, setElementTagsById] = useState<Record<number, string[]>>({})
  const [clickedDebugInfo, setClickedDebugInfo] = useState<ElementDebugInfo | null>(null)
  const [simulatingTruck, setSimulatingTruck] = useState(false)
  const [simStepMs, setSimStepMs] = useState(220)
  const [simOrderedIds, setSimOrderedIds] = useState<number[]>([])
  const [simIndex, setSimIndex] = useState(0)
  const [selectedSimTruck, setSelectedSimTruck] = useState<IfcSelectedTruckInfo | null>(null)
  const [mappingNotice, setMappingNotice] = useState<string | null>(null)
  const [circuitDebugInfo, setCircuitDebugInfo] = useState<CircuitDebugInfo | null>(null)
  const [modelLoadVersion, setModelLoadVersion] = useState(0)
  const [renderedTruckCount, setRenderedTruckCount] = useState(0)
  const [fleetStats, setFleetStats] = useState<FleetStats>({ enPlanta: 0, despachando: 0, recepcion: 0, transile: 0 })
  const loadEpochRef = useRef(0)
  useEffect(() => {
    elementTagsRef.current = elementTagsById
  }, [elementTagsById])


  const effectivePlant: Exclude<PlantId, "AVELLANEDA"> = plant === "AVELLANEDA" ? "RICARDONE" : plant
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  const fileName = file?.name ?? null
  const circuitsForPlant = useMemo(
    () => CIRCUITS.filter((c) => c.plant === effectivePlant),
    [effectivePlant]
  )
  const circuitMap = useMemo(() => {
    const m = new Map<string, CircuitDefinition>()
    for (const c of circuitsForPlant) m.set(c.prefix, c)
    return m
  }, [circuitsForPlant])

  const orderedPrefixes = useMemo(
    () => (effectivePlant === "SAN_LORENZO" ? SAN_LORENZO_ORDER : RICARDONE_ORDER).filter((p) => circuitMap.has(p)),
    [effectivePlant, circuitMap]
  )

  const filteredCircuits = useMemo(() => {
    const t = searchText.trim().toUpperCase()
    const list = orderedPrefixes
      .map((prefix) => circuitMap.get(prefix))
      .filter((c): c is CircuitDefinition => Boolean(c))
    if (!t) return list
    return list.filter((c) => c.prefix.includes(t) || c.label.toUpperCase().includes(t))
  }, [searchText, orderedPrefixes, circuitMap])

  const clearSelection = useCallback(() => {
    setSelectedElementIds([])
    setLastPickedId(null)
    setActiveCircuitPrefix(null)
    setCircuitBuckets(EMPTY_BUCKETS)
    setSimulatingTruck(false)
    setSimOrderedIds([])
    setSimIndex(0)
  }, [])

  const buildSimulationOrder = useCallback((ids: number[]): number[] => {
    if (ids.length <= 2) return [...ids]
    const pointMap = expressPointMapRef.current
    const withPoints = ids
      .map((id) => ({ id, p: pointMap[id] }))
      .filter((x): x is { id: number; p: THREE.Vector3 } => Boolean(x.p))
    if (withPoints.length < 2) return [...ids]
    const key = (v: THREE.Vector3) => v.x + v.z * 0.35
    withPoints.sort((a, b) => key(a.p) - key(b.p))
    const remaining = withPoints.slice(1)
    const ordered: number[] = [withPoints[0].id]
    let current = withPoints[0]
    while (remaining.length > 0) {
      let bestIdx = 0
      let bestDist = Number.POSITIVE_INFINITY
      for (let i = 0; i < remaining.length; i++) {
        const d = current.p.distanceToSquared(remaining[i].p)
        if (d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      }
      current = remaining[bestIdx]
      ordered.push(current.id)
      remaining.splice(bestIdx, 1)
    }
    return ordered
  }, [])

  const applyCircuitByPrefix = useCallback((prefix: string) => {
    const circuit = circuitMap.get(prefix)
    if (!circuit) return
    const prefixUpper = circuit.prefix.toUpperCase()
    const isTransfer = ["E01", "E02", "E03", "F3", "F4", "F6"].includes(prefixUpper)
    const isCargaCircuit = circuit.group === "CARGA"
    const ptdBase = circuit.PTD ? circuit.PTD.replace(/_V\d+$/i, "") : ""
    const ptcBase = circuit.PTC ? circuit.PTC.replace(/_V\d+$/i, "") : ""
    const pointCodeCandidates = [...new Set([
      circuit.PTD,
      ptdBase,
      circuit.PTC,
      ptcBase,
      ptdBase ? ptdBase.replace(/^PTD_/i, "PTC_") : "",
      ptcBase ? ptcBase.replace(/^PTC_/i, "PTD_") : "",
      circuit.PTD ? circuit.PTD.replace(/^PTD_/i, "PTC_") : "",
      circuit.PTC ? circuit.PTC.replace(/^PTC_/i, "PTD_") : "",
    ].filter(Boolean))]
    const camino: number[] = []
    const caminoVacio: number[] = []
    const puntoDescarga: number[] = []
    const puntoCarga: number[] = []
    const mixto: number[] = []
    let foundCir = 0
    let foundVue = 0
    let foundPtd = 0
    let foundPtc = 0
    for (const [idStr, tags] of Object.entries(elementTagsById)) {
      const id = Number(idStr)
      const hasCamino = circuit.CIR ? tags.some((t) => tagMatchesCode(t, circuit.CIR)) : false
      const hasVacio = circuit.VUE ? tags.some((t) => tagMatchesCode(t, circuit.VUE)) : false
      const hasPoint = pointCodeCandidates.some((code) => tags.some((t) => tagMatchesCode(t, code)))
      const hasPtdFamily = [circuit.PTD, ptdBase, ptcBase ? ptcBase.replace(/^PTC_/i, "PTD_") : ""]
        .filter(Boolean)
        .some((code) => tags.some((t) => tagMatchesCode(t, code)))
      const hasPtcFamily = [circuit.PTC, ptcBase, ptdBase ? ptdBase.replace(/^PTD_/i, "PTC_") : ""]
        .filter(Boolean)
        .some((code) => tags.some((t) => tagMatchesCode(t, code)))
      if (hasCamino) {
        camino.push(id)
        foundCir += 1
      }
      if (hasVacio) {
        caminoVacio.push(id)
        foundVue += 1
      }
      if (isTransfer) {
        if (hasPtdFamily) {
          puntoDescarga.push(id)
          foundPtd += 1
        }
        if (hasPtcFamily) {
          puntoCarga.push(id)
          foundPtc += 1
        }
      } else if (hasPoint) {
        if (isCargaCircuit) {
          puntoCarga.push(id)
          foundPtc += 1
        } else {
          puntoDescarga.push(id)
          foundPtd += 1
        }
      }
    }
    const ids = [...new Set([...camino, ...caminoVacio, ...puntoDescarga, ...puntoCarga])]
    setCircuitDebugInfo({
      activePrefix: circuit.prefix,
      searchCir: circuit.CIR,
      searchVue: circuit.VUE,
      searchPointCodes: pointCodeCandidates,
      foundCir,
      foundVue,
      foundPtd,
      foundPtc,
    })
    if (ids.length === 0) {
      const reasons: string[] = []
      if (circuit.CIR && foundCir === 0) reasons.push(`No encontré ningún elemento con Comments contiene ${circuit.CIR}`)
      if (circuit.VUE && foundVue === 0) reasons.push(`No encontré ningún elemento con Comments contiene ${circuit.VUE}`)
      if (pointCodeCandidates.length > 0 && foundPtd + foundPtc === 0) {
        reasons.push(`No encontré ningún elemento con Comments contiene ${pointCodeCandidates.join(" / ")}`)
      }
      setMappingNotice(reasons.length > 0 ? reasons.join(" | ") : `Sin mapeo IFC real para circuito ${circuit.prefix}.`)
    } else {
      setMappingNotice(null)
    }
    setSelectedElementIds(ids)
    setActiveCircuitPrefix(prefix)
    setCircuitBuckets({ camino, caminoVacio, mixto, puntoDescarga, puntoCarga })
    const orderedForSim = buildSimulationOrder(ids)
    setSimOrderedIds(orderedForSim)
    setSimIndex(0)
    setSimulatingTruck(false)
  }, [buildSimulationOrder, circuitMap, elementTagsById])

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl)
    }
  }, [fileUrl])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    loadEpochRef.current += 1
    const currentEpoch = loadEpochRef.current

    container.innerHTML = ""
    setError(null)
    clearSelection()
    setElementTagsById({})
    setClickedDebugInfo(null)
    setSelectedSimTruck(null)
    setMappingNotice(null)
    setCircuitDebugInfo(null)
    expressPointMapRef.current = {}

    const width = container.clientWidth || 800
    const height = container.clientHeight || 500
    const scene = new THREE.Scene()
    scene.background = new THREE.Color("#f8fafc")
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000)
    camera.position.set(18, 16, 20)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 2, 0)
    controls.autoRotate = autoOrbit
    controls.autoRotateSpeed = 1.5
    controls.update()
    controlsRef.current = controls

    const hemi = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.95)
    scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 0.85)
    dir.position.set(20, 30, 15)
    scene.add(dir)

    const loader = new IFCLoader()
    loader.ifcManager.setWasmPath("https://unpkg.com/web-ifc@0.0.39/")
    ifcLoaderRef.current = loader

    let frameId = 0
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }
    animate()

    const onResize = () => {
      const w = container.clientWidth || 800
      const h = container.clientHeight || 500
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener("resize", onResize)

    const onClickModel = async (event: MouseEvent) => {
      const model = ifcModelRef.current
      const cameraObj = cameraRef.current
      const rendererObj = rendererRef.current
      const loaderObj = ifcLoaderRef.current
      if (!model || !cameraObj || !rendererObj || !loaderObj) return

      const rect = rendererObj.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      )
      raycasterRef.current.setFromCamera(mouse, cameraObj)
      const truckHits = raycasterRef.current.intersectObjects(truckMarkersRef.current, false)
      if (truckHits.length > 0) {
        const truckObj = truckHits[0].object
        const truckInfo = truckMarkerDataRef.current.get(truckObj)
        if (truckInfo) {
          setActiveCircuitPrefix(truckInfo.assignedCircuitPrefix)
          applyCircuitByPrefix(truckInfo.assignedCircuitPrefix)
          setSelectedSimTruck(truckInfo)
          return
        }
      }
      const hits = raycasterRef.current.intersectObject(model, true)
      if (hits.length === 0) return
      const ifcManager = loaderObj.ifcManager as unknown as {
        getExpressId: (geometry: THREE.BufferGeometry, faceIndex: number) => number
      }
      let expressId: number | null = null
      for (const hit of hits) {
        const mesh = hit.object as THREE.Mesh
        if (!mesh.geometry || hit.faceIndex == null) continue
        const maybe = ifcManager.getExpressId(mesh.geometry as THREE.BufferGeometry, hit.faceIndex)
        if (typeof maybe !== "number" || Number.isNaN(maybe)) continue
        // Preferimos el primer hit que tenga códigos detectados.
        if (elementTagsRef.current[maybe]?.length) {
          expressId = maybe
          break
        }
        if (expressId == null) expressId = maybe
      }
      if (expressId == null) return

      setLastPickedId(expressId)
      setActiveCircuitPrefix(null)
      setCircuitBuckets(EMPTY_BUCKETS)
      setSimulatingTruck(false)
      setSimOrderedIds([])
      setSimIndex(0)
      setSelectedElementIds((prev) => (
        prev.includes(expressId) ? prev.filter((id) => id !== expressId) : [...prev, expressId]
      ))
      try {
        const info = await readElementDebugInfo(loaderObj, model as THREE.Object3D & { modelID?: number }, expressId)
        setClickedDebugInfo(info)
      } catch {
        setClickedDebugInfo({ expressId, commentsCandidates: [], codesFound: [] })
      }
    }
    renderer.domElement.addEventListener("click", onClickModel)
    const onMoveModel = (event: MouseEvent) => {
      const modelObj = ifcModelRef.current
      const cameraObj = cameraRef.current
      const rendererObj = rendererRef.current
      if (!modelObj || !cameraObj || !rendererObj) return
      const rect = rendererObj.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      )
      raycasterRef.current.setFromCamera(mouse, cameraObj)
      const truckHits = raycasterRef.current.intersectObjects(truckMarkersRef.current, false)
      rendererObj.domElement.style.cursor = truckHits.length > 0 ? "pointer" : "default"
    }
    renderer.domElement.addEventListener("mousemove", onMoveModel)

    if (fileUrl) {
      setLoading(true)
      loader.load(
        fileUrl,
        async (ifcModel) => {
          if (currentEpoch !== loadEpochRef.current) return
          scene.add(ifcModel)
          ifcModelRef.current = ifcModel as unknown as THREE.Object3D
          const box = new THREE.Box3().setFromObject(ifcModel)
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3()).length()
          camera.near = Math.max(size / 1000, 0.01)
          camera.far = Math.max(size * 10, 1000)
          camera.position.set(center.x + size * 0.5, center.y + size * 0.35, center.z + size * 0.5)
          controls.target.copy(center)
          controls.update()
          initialTargetRef.current = center.clone()
          initialPositionRef.current = camera.position.clone()

          let meshes = 0
          let triangles = 0
          ;(ifcModel as unknown as THREE.Object3D).traverse((obj) => {
            const mesh = obj as THREE.Mesh
            if (!mesh.isMesh || !mesh.geometry) return
            mesh.material = hiddenBaseMaterialRef.current
            if (!mesh.userData.__hiddenLineEdges) {
              const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(mesh.geometry as THREE.BufferGeometry, 25),
                hiddenEdgeMaterialRef.current
              )
              edges.name = "__hiddenLineEdges"
              edges.renderOrder = 2
              mesh.add(edges)
              mesh.userData.__hiddenLineEdges = true
            }
            meshes += 1
            const geom = mesh.geometry
            const positionCount = geom.attributes?.position?.count ?? 0
            triangles += geom.index ? geom.index.count / 3 : positionCount / 3
          })
          expressPointMapRef.current = buildExpressPointMap(ifcModel as unknown as THREE.Object3D)
          setStats({ meshes, triangles: Math.round(triangles) })
          try {
            const discovered = await buildIfcTagsMap(loader, ifcModel as unknown as THREE.Object3D & { modelID?: number })
            if (currentEpoch !== loadEpochRef.current) return
            setElementTagsById(discovered)
          } catch {
            // Si falla lectura de tags IFC, el panel igual permite taggear manualmente.
          }
          if (currentEpoch !== loadEpochRef.current) return
          setLoadedFileName(fileName)
          setModelLoadVersion((v) => v + 1)
          setLoading(false)
        },
        undefined,
        (loadError) => {
          if (currentEpoch !== loadEpochRef.current) return
          setError(loadError?.message || "No se pudo abrir el IFC.")
          setLoadedFileName(null)
          setStats(null)
          setRenderedTruckCount(0)
          setLoading(false)
        }
      )
    } else {
      setLoadedFileName(null)
      setStats(null)
      setRenderedTruckCount(0)
      ifcModelRef.current = null
    }

    return () => {
      window.removeEventListener("resize", onResize)
      renderer.domElement.removeEventListener("click", onClickModel)
      renderer.domElement.removeEventListener("mousemove", onMoveModel)
      renderer.domElement.style.cursor = "default"
      window.cancelAnimationFrame(frameId)
      controls.dispose()
      controlsRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      sceneRef.current = null
      ifcLoaderRef.current = null
      ifcModelRef.current = null
      renderer.dispose()
      scene.clear()
      container.innerHTML = ""
      try {
        loader.ifcManager.dispose()
      } catch {
        // Ignorar errores de dispose al cambiar de archivo rápidamente.
      }
    }
  }, [clearSelection, fileName, fileUrl])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.autoRotate = autoOrbit
  }, [autoOrbit])

  useEffect(() => {
    if (!simulatingTruck || simOrderedIds.length === 0) {
      if (simTimerRef.current != null) {
        window.clearInterval(simTimerRef.current)
        simTimerRef.current = null
      }
      return
    }
    simTimerRef.current = window.setInterval(() => {
      setSimIndex((prev) => (prev + 1) % simOrderedIds.length)
    }, simStepMs)
    return () => {
      if (simTimerRef.current != null) {
        window.clearInterval(simTimerRef.current)
        simTimerRef.current = null
      }
    }
  }, [simOrderedIds.length, simStepMs, simulatingTruck])

  useEffect(() => {
    const loader = ifcLoaderRef.current
    const model = ifcModelRef.current as (THREE.Object3D & { modelID?: number }) | null
    const scene = sceneRef.current
    if (!loader || !model || !scene || model.modelID == null) return
    model.visible = true
    const modelID = model.modelID
    const ifcManager = loader.ifcManager as unknown as {
      removeSubset: (id: number, material?: THREE.Material, customID?: string) => void
      createSubset: (config: {
        modelID: number
        ids: number[]
        scene: THREE.Scene
        removePrevious: boolean
        material: THREE.Material
        customID: string
      }) => void
    }
    const clear = (customID: string, material: THREE.Material) => {
      try {
        ifcManager.removeSubset(modelID, material, customID)
      } catch {
        // subset inexistente
      }
    }
    clear("circuit-camino", caminoMaterialRef.current)
    clear("circuit-vacio", caminoVacioMaterialRef.current)
    clear("circuit-mixto", mixtoMaterialRef.current)
    clear("circuit-pd", puntoDescMaterialRef.current)
    clear("circuit-pc", puntoCargaMaterialRef.current)

    if (!activeCircuitPrefix) return

    const add = (ids: number[], material: THREE.Material, customID: string) => {
      if (ids.length === 0) return
      try {
        ifcManager.createSubset({
          modelID,
          ids,
          scene,
          removePrevious: true,
          material,
          customID,
        })
      } catch {
        // Ignorar transiciones de carga
      }
    }
    add(circuitBuckets.caminoVacio, caminoVacioMaterialRef.current, "circuit-vacio")
    add(circuitBuckets.camino, caminoMaterialRef.current, "circuit-camino")
    add(circuitBuckets.mixto, mixtoMaterialRef.current, "circuit-mixto")
    add(circuitBuckets.puntoDescarga, puntoDescMaterialRef.current, "circuit-pd")
    add(circuitBuckets.puntoCarga, puntoCargaMaterialRef.current, "circuit-pc")
  }, [activeCircuitPrefix, circuitBuckets])

  useEffect(() => {
    const loader = ifcLoaderRef.current
    const model = ifcModelRef.current as (THREE.Object3D & { modelID?: number }) | null
    const scene = sceneRef.current
    if (!loader || !model || !scene || model.modelID == null) return
    const modelID = model.modelID
    const ifcManager = loader.ifcManager as unknown as {
      removeSubset: (id: number, material?: THREE.Material, customID?: string) => void
      createSubset: (config: {
        modelID: number
        ids: number[]
        scene: THREE.Scene
        removePrevious: boolean
        material: THREE.Material
        customID: string
      }) => void
    }
    try {
      ifcManager.removeSubset(modelID, truckStepMaterialRef.current, "truck-step")
    } catch {
      // subset inexistente
    }
    if (!simulatingTruck || simOrderedIds.length === 0) return
    const currentId = simOrderedIds[simIndex] ?? null
    if (currentId == null) return
    try {
      ifcManager.createSubset({
        modelID,
        ids: [currentId],
        scene,
        removePrevious: true,
        material: truckStepMaterialRef.current,
        customID: "truck-step",
      })
    } catch {
      // ignorar fallos transitorios
    }
  }, [simIndex, simOrderedIds, simulatingTruck])

  const handleResetView = useCallback(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    camera.position.copy(initialPositionRef.current)
    controls.target.copy(initialTargetRef.current)
    controls.update()
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    const model = ifcModelRef.current
    if (!scene || !model) return

    for (const sprite of truckMarkersRef.current) {
      scene.remove(sprite)
      const material = sprite.material as THREE.SpriteMaterial
      if (material.map) material.map.dispose()
      material.dispose()
    }
    truckMarkersRef.current = []
    truckMarkerDataRef.current.clear()
    setRenderedTruckCount(0)
    setFleetStats({ enPlanta: 0, despachando: 0, recepcion: 0, transile: 0 })
    onFleetChange?.([])

    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const yOffset = Math.max(size.y * 0.08, 1.2)
    const markerScale = Math.max(size.length() * 0.032, 2.8)
    const spreadRadius = Math.max(size.length() * 0.01, 0.4)
    const fallbackNormalizedSlots = [
      { x: 0.16, z: 0.28 },
      { x: 0.36, z: 0.52 },
      { x: 0.58, z: 0.44 },
      { x: 0.74, z: 0.30 },
      { x: 0.52, z: 0.70 },
    ]
    const pointIdsFromComments = Object.entries(elementTagsById)
      .filter(([, tags]) => tags.some((t) => t.startsWith("PTD_") || t.startsWith("PTC_")))
      .map(([idStr]) => Number(idStr))
    const candidatePointIds = pointIdsFromComments.length > 0 ? pointIdsFromComments : TRUCK_LOCATION_EXPRESS_IDS
    const slotEntries = candidatePointIds
      .map((id) => {
        const p = expressPointMapRef.current[id]
        return p ? { expressId: id, point: p.clone() } : null
      })
      .filter((entry): entry is { expressId: number; point: THREE.Vector3 } => Boolean(entry))
    const slotDefinitions = slotEntries.length > 0
      ? slotEntries
      : fallbackNormalizedSlots.map((slot, idx) => ({
          expressId: TRUCK_LOCATION_EXPRESS_IDS[idx] ?? -1,
          point: new THREE.Vector3(
            box.min.x + size.x * slot.x,
            box.min.y + Math.max(size.y * 0.02, 0.2),
            box.min.z + size.z * slot.z
          ),
        }))

    const sprites: THREE.Sprite[] = []
    let recepcion = 0
    let despachando = 0
    let transile = 0
    const generatedFleet: IfcSelectedTruckInfo[] = []
    for (let i = 0; i < FLEET_TRUCK_COUNT; i++) {
      const slotIndex = i % slotDefinitions.length
      const groupIndex = Math.floor(i / slotDefinitions.length)
      const basePoint = slotDefinitions[slotIndex].point
      const locationExpressId = slotDefinitions[slotIndex].expressId
      const angle = (groupIndex * 2.399963229728653 + slotIndex * 0.65) % (Math.PI * 2)
      const ring = Math.floor(groupIndex / 2) + 1
      const radius = spreadRadius * ring
      const px = basePoint.x + Math.cos(angle) * radius
      const pz = basePoint.z + Math.sin(angle) * radius
      const py = basePoint.y + yOffset

      const info = buildSimTruckInfo(i, locationExpressId)
      const def = CIRCUITS.find((c) => c.plant === "RICARDONE" && c.prefix === info.assignedCircuitPrefix)
      if (def?.group === "DESCARGA") recepcion += 1
      else if (def?.group === "CARGA") despachando += 1
      else transile += 1
      const texture = createTruckCircleTexture(info.plate, info.operationType)
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.set(px, py, pz)
      sprite.scale.set(markerScale, markerScale, markerScale)
      sprite.renderOrder = 15
      sprite.frustumCulled = false
      scene.add(sprite)
      sprites.push(sprite)
      truckMarkerDataRef.current.set(sprite, info)
      generatedFleet.push(info)
    }
    truckMarkersRef.current = sprites
    setRenderedTruckCount(sprites.length)
    setFleetStats({ enPlanta: sprites.length, despachando, recepcion, transile })
    onFleetChange?.(generatedFleet)

    return () => {
      for (const sprite of sprites) {
        scene.remove(sprite)
        const material = sprite.material as THREE.SpriteMaterial
        if (material.map) material.map.dispose()
        material.dispose()
      }
      truckMarkersRef.current = []
      truckMarkerDataRef.current.clear()
      setRenderedTruckCount(0)
      setFleetStats({ enPlanta: 0, despachando: 0, recepcion: 0, transile: 0 })
      onFleetChange?.([])
    }
  }, [elementTagsById, modelLoadVersion, onFleetChange])

  useEffect(() => {
    const selectedPlate = selectedSimTruck?.plate ?? null
    let visibleCount = 0
    for (const sprite of truckMarkersRef.current) {
      const info = truckMarkerDataRef.current.get(sprite)
      const base = (sprite.userData.__baseScale as number | undefined) ?? sprite.scale.x
      sprite.userData.__baseScale = base
      const passFilter = operationFilter === "ALL" || info?.operationType === operationFilter
      sprite.visible = passFilter
      if (passFilter) visibleCount += 1

      const isSelected = Boolean(passFilter && selectedPlate && info?.plate === selectedPlate)
      const s = isSelected ? base * 1.22 : base
      sprite.scale.set(s, s, s)
      const mat = sprite.material as THREE.SpriteMaterial
      mat.opacity = isSelected ? 1 : 0.9
    }
    setRenderedTruckCount(visibleCount)
  }, [selectedSimTruck, operationFilter, modelLoadVersion])

  useEffect(() => {
    if (!selectedSimTruck) return
    if (operationFilter === "ALL") return
    if (selectedSimTruck.operationType !== operationFilter) {
      setSelectedSimTruck(null)
    }
  }, [operationFilter, selectedSimTruck])

  return (
    <div className="h-full w-full relative bg-white">
      <div ref={containerRef} className="h-full w-full" />
      {loading && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center text-sm text-slate-700">
          Cargando IFC...
        </div>
      )}
      {!file && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          Seleccioná un archivo `.ifc` para visualizarlo.
        </div>
      )}
      {loadedFileName && !loading && (
        <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-xl border border-slate-200/80 bg-white/92 px-3 py-1.5 text-[11px] text-slate-700 shadow-lg backdrop-blur-sm">
          <span className="font-semibold text-slate-900">En planta:</span> {fleetStats.enPlanta}
          <span className="mx-2 text-slate-300">|</span>
          <span className="font-semibold text-emerald-700">Despachando:</span> {fleetStats.despachando}
          <span className="mx-2 text-slate-300">|</span>
          <span className="font-semibold text-sky-700">Recepcion:</span> {fleetStats.recepcion}
          <span className="mx-2 text-slate-300">|</span>
          <span className="font-semibold text-violet-700">Transile:</span> {fleetStats.transile}
        </div>
      )}
      {error && (
        <div className="absolute right-3 top-3 max-w-[340px] rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow-sm">
          {error}
        </div>
      )}
      {selectedSimTruck && (
        <div className="absolute left-1/2 top-12 z-20 w-[1120px] max-w-[calc(100%-24px)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-2xl backdrop-blur-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_430px]">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs text-slate-700">
              <div className="col-span-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Patente</div>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold leading-none text-blue-700">{selectedSimTruck.plate}</div>
                  <div
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      selectedSimTruck.operationType === "RECEPCION"
                        ? "bg-sky-100 text-sky-700"
                        : selectedSimTruck.operationType === "DESPACHANDO"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-violet-100 text-violet-700"
                    }`}
                  >
                    {selectedSimTruck.operationType}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Tipo de carga</div>
                <div className="text-sm font-semibold text-slate-900">{selectedSimTruck.cargoType}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Ultima check</div>
                <div className="text-sm font-semibold text-slate-900">{selectedSimTruck.lastCheckpoint}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Chofer</div>
                <div className="text-xs font-medium text-slate-900">{selectedSimTruck.driverName}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Circuito activo</div>
                <div className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                  {selectedSimTruck.assignedCircuitPrefix}
                </div>
              </div>
              <div className="text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">Camiones simulados:</span> {renderedTruckCount}/{FLEET_TRUCK_COUNT}
              </div>
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setSelectedSimTruck(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
            <div className="md:justify-self-end">
              <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-900/95 shadow-lg ring-1 ring-slate-200/70">
                <div className="flex items-center justify-between border-b border-slate-700 px-3 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">Camara operativa</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    REC
                  </span>
                </div>
                <img
                  src={selectedSimTruck.cameraImageUrl}
                  alt={`Camara ${selectedSimTruck.plate}`}
                  className="h-[176px] w-full object-cover md:w-[410px]"
                />
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 z-10 flex max-w-[60%] flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAutoOrbit((prev) => !prev)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold shadow-sm border transition ${
            autoOrbit
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white/95 text-slate-700 hover:bg-white"
          }`}
        >
          {autoOrbit ? "Orbitar ON" : "Orbitar OFF"}
        </button>
        <button
          type="button"
          onClick={handleResetView}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100"
        >
          Reset vista
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="rounded-lg border border-slate-300 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
        >
          Limpiar selección
        </button>
      </div>
    </div>
  )
}
