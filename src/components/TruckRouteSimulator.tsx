/**
 * Simulador: una visita, play/pause, velocidad, event log.
 * Sin rutas predefinidas, sin comparar, sin filtros ni aleatorio.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from "react"
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

  return (
    <div className="flex h-[calc(100vh-80px)] gap-4 p-4">
      {/* Left: selector + controles */}
      <aside className="w-72 flex flex-col gap-4 shrink-0">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Control</h2>
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
          <h2 className="text-sm font-semibold text-slate-700">Mapa de planta</h2>
        </div>
        <div className="relative h-[calc(100%-48px)]">
          {seq.length === 0 ? (
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
