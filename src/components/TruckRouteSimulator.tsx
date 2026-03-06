/**
 * Simulador: una visita, play/pause, velocidad, event log.
 * Sin rutas predefinidas, sin comparar, sin filtros ni aleatorio.
 */

import { useCallback, useEffect, useRef, useState, useMemo, type ChangeEvent } from "react"
import { animate, useMotionValue, useMotionValueEvent, useTransform } from "framer-motion"
import { motion } from "framer-motion"
import { stepToNode } from "../data/routes"
import { buildPathForSequence, WAYPOINTS, ZONES, getPathAngleAt } from "../data/waypoints"
import { TruckIcon } from "./TruckIcon"
import { useSite } from "../context/SiteContext"
import { useData } from "../context/DataContext"
import { useSimulatorVisit } from "../context/SimulatorVisitContext"
import { buildTripSummaryFromEvents } from "../engine"
import { visitToSimNodesWithEventIndex } from "../simulator/visitToSimNodes"
import { VisitPickerSimple } from "./VisitPickerSimple"
import { EVENT_TYPE_LABELS } from "../lib/eventLabels"
import type { ReconstructedVisit } from "../domain/events"
import { IfcViewer, type IfcSelectedTruckInfo, type PlantId } from "./IfcViewer"

type StationState = "idle" | "active" | "visited"

const SPEEDS = [0.5, 1, 2, 4] as const
const BASE_DURATION_MS = 2800
const PAUSE_AT_STATION_MS = 400

const STATION_LABELS: Record<string, string> = {
  A: "Ingreso",
  B: "Balanza 1",
  C: "Calada",
  D: "Descarga",
  E: "Balanza 2",
  F: "Egreso",
  G: "Espera",
}

function useAnimateRoute(
  seq: string[],
  speed: number,
  isPlaying: boolean,
  onStepChange: (index: number) => void,
  onComplete: () => void
) {
  const pathRef = useRef<SVGPathElement | null>(null)
  const progress = useMotionValue(0)
  const cancelledRef = useRef(false)
  const [truckState, setTruckState] = useState(() => {
    const first = seq[0] ? WAYPOINTS[stepToNode(seq[0])] : null
    return { x: first?.x ?? 0, y: first?.y ?? 0, angle: 0 }
  })

  useMotionValueEvent(progress, "change", (v) => {
    const path = pathRef.current
    if (!path || seq.length === 0) return
    const len = path.getTotalLength()
    if (len === 0) return
    const pt = path.getPointAtLength(v * len)
    const angle = getPathAngleAt(path, v)
    setTruckState({ x: pt.x, y: pt.y, angle })
    const stepIdx = Math.min(Math.floor(v * seq.length), seq.length - 1)
    onStepChange(stepIdx)
  })

  const run = useCallback(async () => {
    if (seq.length < 2) return
    cancelledRef.current = false
    const path = pathRef.current
    if (!path) return
    const numSegments = seq.length - 1
    const segmentDuration = BASE_DURATION_MS / speed / 1000
    for (let i = 0; i < numSegments; i++) {
      if (cancelledRef.current) return
      const endP = (i + 1) / numSegments
      const ctrl = animate(progress, endP, { duration: segmentDuration, ease: [0.4, 0, 0.2, 1] })
      await Promise.race([
        new Promise<void>((resolve) => ctrl.then(resolve)),
        new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (cancelledRef.current) { ctrl.stop(); clearInterval(check); resolve() }
          }, 50)
        }),
      ])
      if (cancelledRef.current) return
      onStepChange(i + 1)
      if (i < numSegments - 1) await new Promise((r) => setTimeout(r, PAUSE_AT_STATION_MS))
    }
    onComplete()
  }, [seq, speed, progress, onStepChange, onComplete])

  const cancel = useCallback(() => { cancelledRef.current = true }, [])

  useEffect(() => {
    if (isPlaying) run()
  }, [isPlaying])

  return { pathRef, progress, truckState, cancel }
}

interface TruckRouteSimulatorProps {
  onOpenVisitDetail?: (visit: ReconstructedVisit) => void
}

export default function TruckRouteSimulator({ onOpenVisitDetail }: TruckRouteSimulatorProps) {
  const { siteId } = useSite()
  const { getVisitsBySite } = useData()
  const { visitToSimulate, setVisitToSimulate } = useSimulatorVisit()
  const siteVisits = getVisitsBySite(siteId)

  const [selectedVisitIndex, setSelectedVisitIndex] = useState(0)
  const [simulatingVisit, setSimulatingVisit] = useState<ReconstructedVisit | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [speed, setSpeed] = useState<number>(1)
  const [viewerMode, setViewerMode] = useState<"map" | "ifc">("ifc")
  const [ifcFile, setIfcFile] = useState<File | null>(null)
  const [ifcPlant, setIfcPlant] = useState<PlantId>("RICARDONE")
  const [fleetTrucks, setFleetTrucks] = useState<IfcSelectedTruckInfo[]>([])
  const [fleetOperationFilter, setFleetOperationFilter] = useState<"ALL" | IfcSelectedTruckInfo["operationType"]>("ALL")
  const [expandedCircuitGroups, setExpandedCircuitGroups] = useState<Record<string, boolean>>({})
  const [expandedMainFleetGroups, setExpandedMainFleetGroups] = useState<Record<string, boolean>>({
    DESCARGAS: false,
    CARGAS: false,
    MOVIMIENTO_INTERNO: false,
  })

  useEffect(() => {
    if (visitToSimulate) {
      const idx = siteVisits.findIndex((v) => v.visitId === visitToSimulate.visitId)
      if (idx >= 0) setSelectedVisitIndex(idx)
      setSimulatingVisit(visitToSimulate)
      setVisitToSimulate(null)
    }
  }, [visitToSimulate, setVisitToSimulate, siteVisits])

  const { nodes: visitSeq, eventIndexPerNode, caladaResultByNodeIndex } = useMemo(() => {
    if (!simulatingVisit) return { nodes: [] as string[], eventIndexPerNode: [] as number[], caladaResultByNodeIndex: {} as Record<number, string> }
    const r = visitToSimNodesWithEventIndex(simulatingVisit)
    return { nodes: r.nodes, eventIndexPerNode: r.eventIndexPerNode, caladaResultByNodeIndex: r.caladaResultByNodeIndex ?? {} }
  }, [simulatingVisit])

  const seq = visitSeq
  const routePath = seq.length > 0 ? buildPathForSequence(seq, stepToNode) : ''

  const getCaladaForStep = useCallback(
    (index: number): string | undefined => caladaResultByNodeIndex[index],
    [caladaResultByNodeIndex]
  )

  const getStationState = useCallback(
    (nodeId: string): StationState => {
      const idx = seq.findIndex((s) => stepToNode(s) === nodeId)
      if (idx < 0) return "idle"
      if (idx < currentStepIndex) return "visited"
      if (idx === currentStepIndex) return "active"
      return "idle"
    },
    [seq, currentStepIndex]
  )

  const handleStepChange = useCallback((index: number) => setCurrentStepIndex(index), [])
  const handleComplete = useCallback(() => setIsPlaying(false), [])

  const { pathRef, progress, truckState, cancel } = useAnimateRoute(seq, speed, isPlaying, handleStepChange, handleComplete)

  const trailOffset = useTransform(progress, (v) => 1 - v)
  const futureDashOffset = useTransform(progress, (v) => v)

  const play = useCallback(() => {
    if (currentStepIndex >= seq.length - 1) {
      setCurrentStepIndex(0)
      progress.set(0)
    }
    setIsPlaying(true)
  }, [seq, currentStepIndex, progress])

  const pause = useCallback(() => {
    setIsPlaying(false)
    cancel()
  }, [cancel])

  const reset = useCallback(() => {
    pause()
    setCurrentStepIndex(0)
    progress.set(0)
  }, [pause, progress])

  useEffect(() => {
    reset()
  }, [simulatingVisit?.visitId])

  const eventList = useMemo(() => {
    if (simulatingVisit && eventIndexPerNode.length === seq.length) {
      return seq.map((s, i) => {
        const evIdx = eventIndexPerNode[i]
        const ev = evIdx != null ? simulatingVisit.events[evIdx] : null
        const baseLabel = ev ? (EVENT_TYPE_LABELS[ev.eventType as keyof typeof EVENT_TYPE_LABELS] ?? ev.eventType) : STATION_LABELS[s] ?? s
        const calada = getCaladaForStep(i)
        const label = s === "C" && calada ? `${baseLabel} · ${calada}` : baseLabel
        const timestamp = ev ? new Date(ev.occurredAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
        return { step: s, nodeId: s, index: i, timestamp, label }
      })
    }
    return seq.map((s, i) => ({
      step: s,
      nodeId: s,
      index: i,
      timestamp: '',
      label: STATION_LABELS[s] ?? s,
    }))
  }, [seq, simulatingVisit, eventIndexPerNode, getCaladaForStep])

  const timelineRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const item = timelineRef.current?.children[currentStepIndex] as HTMLElement
    if (item) item.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [currentStepIndex])

  const handleIfcFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null
    setIfcFile(selected)
  }, [])

  const filteredFleetTrucks = useMemo(() => {
    if (fleetOperationFilter === "ALL") return fleetTrucks
    return fleetTrucks.filter((truck) => truck.operationType === fleetOperationFilter)
  }, [fleetTrucks, fleetOperationFilter])

  const groupedFleetByCircuit = useMemo(() => {
    const groups = new Map<string, { prefix: string; label: string; trucks: IfcSelectedTruckInfo[] }>()
    for (const truck of filteredFleetTrucks) {
      const prefix = truck.assignedCircuitPrefix || "SIN_CIRCUITO"
      const label = truck.assignedCircuitLabel || "Sin nombre"
      const key = `${prefix}__${label}`
      if (!groups.has(key)) groups.set(key, { prefix, label, trucks: [] })
      groups.get(key)!.trucks.push(truck)
    }
    const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" })
    return [...groups.values()]
      .sort((a, b) => collator.compare(a.prefix, b.prefix))
      .map((g) => ({ ...g, trucks: g.trucks.sort((a, b) => collator.compare(a.plate, b.plate)) }))
  }, [filteredFleetTrucks])

  const fleetAnomalies = useMemo(() => {
    const out: string[] = []
    const byPlate = new Map<string, number>()
    for (const truck of filteredFleetTrucks) {
      const plate = (truck.plate || "").trim().toUpperCase()
      if (!plate) continue
      byPlate.set(plate, (byPlate.get(plate) ?? 0) + 1)
    }
    const duplicated = [...byPlate.entries()].filter(([, count]) => count > 1)
    if (duplicated.length > 0) out.push(`Patentes duplicadas: ${duplicated.map(([p]) => p).join(", ")}`)
    const noCircuit = filteredFleetTrucks.filter((t) => !t.assignedCircuitPrefix)
    if (noCircuit.length > 0) out.push(`Camiones sin circuito: ${noCircuit.length}`)
    const noCheck = filteredFleetTrucks.filter((t) => !t.lastCheckpoint)
    if (noCheck.length > 0) out.push(`Camiones sin ultima check: ${noCheck.length}`)
    return out
  }, [filteredFleetTrucks])

  const groupedFleetPanels = useMemo(() => {
    const groupOrder = ["DESCARGAS", "CARGAS", "MOVIMIENTO_INTERNO"] as const
    const groupLabels: Record<(typeof groupOrder)[number], string> = {
      DESCARGAS: "Descargas",
      CARGAS: "Cargas",
      MOVIMIENTO_INTERNO: "Movimiento interno",
    }
    const resolveMainGroup = (prefix: string): (typeof groupOrder)[number] => {
      const p = (prefix || "").toUpperCase()
      if (p.startsWith("A") || p.startsWith("C")) return "DESCARGAS"
      if (p.startsWith("B") || p.startsWith("D") || ["F1", "F2", "F5"].includes(p)) return "CARGAS"
      return "MOVIMIENTO_INTERNO"
    }

    const groups: Record<(typeof groupOrder)[number], Record<string, { family: string; circuits: typeof groupedFleetByCircuit }>> = {
      DESCARGAS: {},
      CARGAS: {},
      MOVIMIENTO_INTERNO: {},
    }
    for (const circuit of groupedFleetByCircuit) {
      const main = resolveMainGroup(circuit.prefix)
      const family = (circuit.prefix || "?").charAt(0).toUpperCase()
      if (!groups[main][family]) groups[main][family] = { family, circuits: [] }
      groups[main][family].circuits.push(circuit)
    }

    return groupOrder.map((id) => {
      const families = Object.values(groups[id])
        .sort((a, b) => a.family.localeCompare(b.family, "es"))
        .map((f) => ({
          ...f,
          circuits: f.circuits.sort((a, b) => a.prefix.localeCompare(b.prefix, "es", { numeric: true })),
        }))
      const total = families.reduce((acc, f) => acc + f.circuits.reduce((sum, c) => sum + c.trucks.length, 0), 0)
      return { id, label: groupLabels[id], families, total }
    })
  }, [groupedFleetByCircuit])

  const fleetKpis = useMemo(() => {
    const recepcion = fleetTrucks.filter((t) => t.operationType === "RECEPCION").length
    const despachando = fleetTrucks.filter((t) => t.operationType === "DESPACHANDO").length
    const transile = fleetTrucks.filter((t) => t.operationType === "TRANSILE").length
    return [
      { id: "TOTAL", label: "Camiones en planta", value: fleetTrucks.length, tone: "slate", filter: "ALL" as const },
      { id: "DESP", label: "Despachando", value: despachando, tone: "emerald", filter: "DESPACHANDO" as const },
      { id: "RECEP", label: "Recepcion", value: recepcion, tone: "sky", filter: "RECEPCION" as const },
      { id: "TRANS", label: "Transile", value: transile, tone: "violet", filter: "TRANSILE" as const },
    ] as const
  }, [fleetTrucks])

  const getMainGroupTone = useCallback((groupId: string) => {
    if (groupId === "DESCARGAS") {
      return {
        card: "border-sky-200 bg-sky-50/70",
        badge: "bg-sky-100 text-sky-700",
      }
    }
    if (groupId === "CARGAS") {
      return {
        card: "border-emerald-200 bg-emerald-50/70",
        badge: "bg-emerald-100 text-emerald-700",
      }
    }
    return {
      card: "border-violet-200 bg-violet-50/70",
      badge: "bg-violet-100 text-violet-700",
    }
  }, [])

  useEffect(() => {
    setExpandedCircuitGroups((prev) => {
      const next: Record<string, boolean> = {}
      for (const group of groupedFleetByCircuit) {
        const key = `${group.prefix}-${group.label}`
        next[key] = prev[key] ?? false
      }
      return next
    })
  }, [groupedFleetByCircuit])

  useEffect(() => {
    setExpandedMainFleetGroups((prev) => ({
      DESCARGAS: prev.DESCARGAS ?? false,
      CARGAS: prev.CARGAS ?? false,
      MOVIMIENTO_INTERNO: prev.MOVIMIENTO_INTERNO ?? false,
    }))
  }, [groupedFleetPanels])

  useEffect(() => {
    let cancelled = false
    const autoLoadDefaultIfc = async () => {
      if (ifcFile) return
      const urls = [
        "/ricardone_desenlazado.ifc",
        "/models/ricardone_desenlazado.ifc",
        "file:///C:/Users/Usuario/Desktop/ricardone_desenlazado.ifc",
      ]
      for (const url of urls) {
        try {
          const resp = await fetch(url)
          if (!resp.ok) continue
          const blob = await resp.blob()
          if (!blob || blob.size === 0) continue
          if (!cancelled) setIfcFile(new File([blob], "ricardone_desenlazado.ifc", { type: "application/octet-stream" }))
          return
        } catch {
          // try next url
        }
      }
    }
    autoLoadDefaultIfc()
    return () => { cancelled = true }
  }, [ifcFile])

  if (viewerMode === "ifc") {
    return (
      <div className="flex h-[calc(100vh-80px)] gap-4 bg-slate-100/70 p-4">
        <section className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Visor IFC operacional</h2>
                <p className="text-[11px] text-slate-500">Trazabilidad en tiempo real por circuito y estado.</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Planta</span>
                <span className="h-4 w-px bg-slate-200" />
                <select
                  value={ifcPlant}
                  onChange={(e) => setIfcPlant(e.target.value as PlantId)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none ring-blue-200 focus:ring-2"
                >
                  <option value="RICARDONE">RICARDONE</option>
                  <option value="SAN_LORENZO">SAN_LORENZO</option>
                  <option value="AVELLANEDA">AVELLANEDA</option>
                </select>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              {fleetKpis.map((kpi) => (
                <button
                  key={kpi.id}
                  type="button"
                  onClick={() => setFleetOperationFilter(kpi.filter)}
                  className={`rounded-xl border px-3 py-2 ${
                    kpi.tone === "emerald"
                      ? "border-emerald-200 bg-emerald-50/70"
                      : kpi.tone === "sky"
                        ? "border-sky-200 bg-sky-50/70"
                        : kpi.tone === "violet"
                          ? "border-violet-200 bg-violet-50/70"
                          : "border-slate-200 bg-slate-50"
                  } ${
                    fleetOperationFilter === kpi.filter
                      ? "ring-2 ring-blue-400 shadow-md"
                      : "opacity-90 hover:opacity-100"
                  } text-left transition`}
                >
                  <div className="text-[11px] font-medium text-slate-500">{kpi.label}</div>
                  <div className="text-lg font-bold text-slate-900">{kpi.value}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="relative h-[calc(100%-128px)]">
            <IfcViewer
              file={ifcFile}
              plant={ifcPlant}
              onFleetChange={setFleetTrucks}
              operationFilter={fleetOperationFilter}
            />
          </div>
        </section>

        <aside className="w-[360px] shrink-0">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Camiones en planta</h2>
              <p className="text-[11px] text-slate-500">
                {filteredFleetTrucks.length} unidades visibles
                {fleetOperationFilter !== "ALL" ? ` (${fleetOperationFilter.toLowerCase()})` : ""}
              </p>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
              {filteredFleetTrucks.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  {fleetTrucks.length === 0 ? "Cargando camiones..." : "Sin camiones para este filtro"}
                </div>
              ) : (
                groupedFleetPanels.map((mainGroup) => {
                  const tone = getMainGroupTone(mainGroup.id)
                  return (
                    <div key={mainGroup.id} className={`overflow-hidden rounded-xl border ${tone.card}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedMainFleetGroups((prev) => ({ ...prev, [mainGroup.id]: !prev[mainGroup.id] }))}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition hover:bg-white/60"
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-900">{mainGroup.label}</div>
                          <div className="text-[11px] text-slate-500">{mainGroup.total} camiones</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.badge}`}>
                            {mainGroup.families.length} familias
                          </span>
                          <span className="text-slate-500">{expandedMainFleetGroups[mainGroup.id] ? "▾" : "▸"}</span>
                        </div>
                      </button>
                      {expandedMainFleetGroups[mainGroup.id] && (
                        <div className="space-y-2 border-t border-white/70 bg-white/70 p-2">
                          {mainGroup.families.map((familyBlock) => (
                            <div key={`${mainGroup.id}-${familyBlock.family}`} className="rounded-lg border border-slate-200 bg-white p-2">
                              <div className="mb-1.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                Familia {familyBlock.family}
                              </div>
                              <div className="space-y-1">
                                {familyBlock.circuits.map((group) => {
                                  const key = `${group.prefix}-${group.label}`
                                  return (
                                    <div key={key} className="overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedCircuitGroups((prev) => ({ ...prev, [key]: !prev[key] }))}
                                        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left transition hover:bg-white"
                                      >
                                        <div>
                                          <div className="text-xs font-semibold text-slate-800">{group.prefix} · {group.label}</div>
                                          <div className="text-[11px] text-slate-500">{group.trucks.length} camiones</div>
                                        </div>
                                        <span className="text-slate-500">{expandedCircuitGroups[key] ? "▾" : "▸"}</span>
                                      </button>
                                      {expandedCircuitGroups[key] && (
                                        <div className="space-y-1 border-t border-slate-200 bg-white p-2">
                                          {group.trucks.map((truck) => (
                                            <div key={truck.plate} className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                                              <div className="flex items-center justify-between gap-2">
                                                <div className="text-xs font-bold text-slate-900">{truck.plate}</div>
                                                <span
                                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                    truck.operationType === "RECEPCION"
                                                      ? "bg-sky-100 text-sky-700"
                                                      : truck.operationType === "DESPACHANDO"
                                                        ? "bg-emerald-100 text-emerald-700"
                                                        : "bg-violet-100 text-violet-700"
                                                  }`}
                                                >
                                                  {truck.operationType}
                                                </span>
                                              </div>
                                              <div className="mt-0.5 text-[11px] text-slate-600">{truck.cargoType} · {truck.lastCheckpoint}</div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
            <div className="border-t border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-900">Anomalias</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    fleetAnomalies.length === 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {fleetAnomalies.length === 0 ? "OK" : `${fleetAnomalies.length} alertas`}
                </span>
              </div>
              {fleetAnomalies.length === 0 ? (
                <div className="text-[11px] text-emerald-700">Sin anomalias detectadas</div>
              ) : (
                <div className="space-y-1">
                  {fleetAnomalies.map((msg, idx) => (
                    <div key={idx} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{msg}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-80px)] gap-4 p-4">
      {/* Left: selector + controles */}
      <aside className="w-72 flex flex-col gap-4 shrink-0">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Control</h2>
          <div className="mb-3">
            <label className="block text-xs text-slate-500 mb-1">Modo de vista</label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setViewerMode("map")}
                className={`flex-1 rounded py-1.5 text-xs font-medium ${viewerMode === "map" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Mapa
              </button>
              <button
                type="button"
                onClick={() => setViewerMode("ifc")}
                className={`flex-1 rounded py-1.5 text-xs font-medium ${viewerMode === "ifc" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                IFC
              </button>
            </div>
          </div>
          {viewerMode === "ifc" && (
            <div className="mb-3 rounded-lg border border-slate-200 p-2">
              <label className="block text-xs text-slate-500 mb-1">Archivo IFC</label>
              <input
                type="file"
                accept=".ifc"
                onChange={handleIfcFileChange}
                className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-medium"
              />
              <div className="mt-1 text-[11px] text-slate-500 truncate" title={ifcFile?.name ?? ""}>
                {ifcFile ? `Cargado: ${ifcFile.name}` : "Sin archivo seleccionado"}
              </div>
            </div>
          )}
          <VisitPickerSimple
            visits={siteVisits}
            selectedIndex={selectedVisitIndex}
            onSelectIndex={setSelectedVisitIndex}
            onLoadVisit={() => setSimulatingVisit(siteVisits[Math.min(selectedVisitIndex, siteVisits.length - 1)] ?? null)}
            onOpenDetail={onOpenVisitDetail}
          />
          {simulatingVisit && (
            <>
              <hr className="border-slate-200 my-3" />
              <div className="flex gap-2">
                <button onClick={play} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">▶ Reproducir</button>
                <button onClick={pause} className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">⏸</button>
                <button onClick={reset} className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">↺ Reset</button>
              </div>
              <div className="mt-3">
                <label className="block text-xs text-slate-500 mb-1">Velocidad</label>
                <div className="flex gap-1">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`flex-1 rounded py-1.5 text-xs font-medium ${speed === s ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        {simulatingVisit && (() => {
          const summary = buildTripSummaryFromEvents(simulatingVisit.events)
          return (
            <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Resumen visita</h2>
              <ul className="text-xs text-slate-600 space-y-1">
                <li>Ciclo: {simulatingVisit.metrics.cycleTimeMinutes ?? '—'} min</li>
                <li className="font-mono">Path: {summary.pathDisplay || summary.path || '—'}</li>
              </ul>
            </div>
          )
        })()}
      </aside>

      {/* Center: mapa */}
      <section className="flex-1 min-w-0 rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-2 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700">
            {viewerMode === "ifc" ? "Visor IFC" : "Mapa de planta"}
          </h2>
        </div>
        <div className="relative h-[calc(100%-48px)]">
          {viewerMode === "ifc" ? (
            <IfcViewer file={ifcFile} />
          ) : seq.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
              Elegí una visita y cargala para ver el recorrido.
            </div>
          ) : (
            <svg viewBox="0 0 1100 400" preserveAspectRatio="xMidYMid meet" className="w-full h-full">
              <defs>
                <filter id="zoneGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <pattern id="concrete" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="0.5" fill="#78716c" fillOpacity="0.2" />
                  <circle cx="12" cy="8" r="0.5" fill="#78716c" fillOpacity="0.15" />
                  <circle cx="6" cy="15" r="0.5" fill="#78716c" fillOpacity="0.18" />
                </pattern>
              </defs>
              <rect width="1100" height="400" fill="#9ca3af" fillOpacity="0.4" />
              <rect width="1100" height="400" fill="url(#concrete)" opacity="0.4" />
              <path ref={pathRef} d={routePath} fill="none" stroke="transparent" strokeWidth="1" style={{ visibility: "hidden" }} />
              {routePath && (
                <motion.path d={routePath} fill="none" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" pathLength={1} style={{ strokeDasharray: "0.006 0.006", strokeDashoffset: futureDashOffset }} />
              )}
              {routePath && (
                <motion.path d={routePath} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: trailOffset }} />
              )}
              {Object.entries(ZONES).map(([nodeId, zone]) => {
                const state = getStationState(nodeId)
                const fill = state === "active" ? "rgba(96, 165, 250, 0.25)" : state === "visited" ? "rgba(134, 239, 172, 0.2)" : "rgba(203, 213, 225, 0.2)"
                const stroke = state === "active" ? "rgba(59, 130, 246, 0.6)" : state === "visited" ? "rgba(34, 197, 94, 0.4)" : "rgba(148, 163, 184, 0.4)"
                return (
                  <g key={nodeId}>
                    <motion.rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx={6} fill={fill} stroke={stroke} strokeWidth={1} initial={false} animate={{ filter: state === "active" ? "url(#zoneGlow)" : "none" }} />
                    <text x={zone.x + zone.w / 2} y={zone.y + zone.h / 2 - 4} textAnchor="middle" className="text-[11px] font-semibold fill-slate-600">{nodeId}</text>
                    <text x={zone.x + zone.w / 2} y={zone.y + zone.h / 2 + 10} textAnchor="middle" className="text-[9px] fill-slate-500">{STATION_LABELS[nodeId]}</text>
                  </g>
                )
              })}
              <g transform={`translate(${truckState.x}, ${truckState.y}) rotate(${(truckState.angle * 180) / Math.PI})`}>
                <TruckIcon />
              </g>
            </svg>
          )}
        </div>
      </section>

      {/* Right: Event Log */}
      <aside className="w-80 flex flex-col shrink-0">
        <div className="rounded-xl bg-white shadow-sm border border-slate-200 flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">Event Log</h2>
          </div>
          <div ref={timelineRef} className="flex-1 overflow-y-auto p-2 space-y-1">
            {eventList.map((ev, i) => (
              <motion.div
                key={`${ev.nodeId}-${i}`}
                layout
                className={`rounded-lg px-3 py-2 text-sm ${
                  i === currentStepIndex ? "bg-blue-50 border border-blue-400/40" : i < currentStepIndex ? "bg-green-50/80 border border-green-400/30" : "bg-slate-50 border border-transparent"
                }`}
              >
                <div className="font-medium text-slate-800">{ev.nodeId} · {ev.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{ev.timestamp}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
