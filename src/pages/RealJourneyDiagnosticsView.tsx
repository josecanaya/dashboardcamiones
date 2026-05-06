import { buildJourneyEventListPublicDisplayUrl, resolveJourneyEventApiOrigin } from '../services/realJourneyEventsDataSource'
import { normalizeSequenceForPattern, pctOfIncomplete } from '../services/realIncompleteAnalysis'
import { preliminaryCircuitTypicalSectorPath, OBSERVABLE_JOURNEY_CODES } from '../services/realPreliminaryCircuit'
import type { OperationalDepurationSnapshot, OperationalJourneyScopeFilter } from '../services/realJourneyDepurationMap'
import type { PlateQualitySummaryResult } from '../services/realPlateQuality'
import type { CameraCoverageBuildResult } from '../services/realCameraCoverage'
import type { IncompleteSequenceGroup } from '../services/realIncompleteAnalysis'
import { normalizeRealEventPoint } from '../services/realEventNormalization'
import type { RealJourneyEventDto, ReconstructedRealJourney } from '../services/realJourneyEvents.types'
import { ExecutiveMetricCard } from '../components/realDiagnostics/ExecutiveMetricCard'
import { DiagDrawer } from '../components/realDiagnostics/DiagDrawer'
import { DataDistributionDonut } from '../components/realDiagnostics/DataDistributionDonut'
import { DataQualityFunnel } from '../components/realDiagnostics/DataQualityFunnel'
import { HorizontalBarChart } from '../components/realDiagnostics/HorizontalBarChart'

export type RealDataMainTab = 'resumen' | 'depuracion' | 'circuitos' | 'incompletos' | 'camaras' | 'buscar'

export const MAIN_TABS: { id: RealDataMainTab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'depuracion', label: 'Depuración' },
  { id: 'circuitos', label: 'Circuitos preliminares' },
  { id: 'incompletos', label: 'Incompletos' },
  { id: 'camaras', label: 'Cámaras / OCR' },
  { id: 'buscar', label: 'Buscar patente' },
]

type RealDataSource = 'api' | 'file'

export type JourneyQuickFilter =
  | 'all'
  | 'complete_minimal'
  | 'incomplete'
  | 'solo_ingreso'
  | 'solo_egreso'
  | 'solo_volcable'
  | 'volcable_ingreso'
  | 'volcable_complete'
  | 'mixed'
  | 'long'
  | 'repeat'
  | 'inc_prelim'
  | 'inc_prelim_grouped'
  | 'inc_prelim_with_ing'
  | 'inc_prelim_without_ing'
  | 'inc_prelim_with_bal'
  | 'inc_prelim_with_volc'
  | 'inc_prelim_with_egr'
  | 'inc_prelim_sl'

const DEPURATION_SCOPE_OPTIONS: { id: OperationalJourneyScopeFilter; label: string }[] = [
  { id: 'all', label: 'Ver todos' },
  { id: 'useful_only', label: 'Solo útiles' },
  { id: 'discarded_only', label: 'Solo descartados' },
  { id: 'solo_ingreso_discarded', label: 'Solo ingreso descartado' },
  { id: 'solo_egreso_discarded', label: 'Solo egreso descartado' },
  { id: 'minimal_valid', label: 'Válidos mínimos' },
  { id: 'partial_valid', label: 'Válidos parciales' },
  { id: 'real_incomplete', label: 'Incompletos reales' },
  { id: 'solo_volcable', label: 'Solo Volcable' },
]

const QUICK_FILTER_OPTIONS: { id: JourneyQuickFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'complete_minimal', label: 'Completos mínimos' },
  { id: 'incomplete', label: 'Incompletos (calidad)' },
  { id: 'solo_ingreso', label: 'Solo ingreso' },
  { id: 'solo_egreso', label: 'Solo egreso' },
  { id: 'solo_volcable', label: 'Solo volcable' },
  { id: 'volcable_ingreso', label: 'Volcable con ingreso' },
  { id: 'volcable_complete', label: 'Volcable completo mínimo' },
  { id: 'mixed', label: 'Mixtos R/SL' },
  { id: 'long', label: 'Sospechosos largos' },
  { id: 'repeat', label: 'Repetición mismo sector' },
  { id: 'inc_prelim', label: 'Solo incompletos (prelim)' },
  { id: 'inc_prelim_grouped', label: 'Incompletos agrupados' },
  { id: 'inc_prelim_with_ing', label: 'Incompl. + ingreso' },
  { id: 'inc_prelim_without_ing', label: 'Incompl. sin ingreso' },
  { id: 'inc_prelim_with_bal', label: 'Incompl. + balanza' },
  { id: 'inc_prelim_with_volc', label: 'Incompl. + volcable' },
  { id: 'inc_prelim_with_egr', label: 'Incompl. + egreso' },
  { id: 'inc_prelim_sl', label: 'Incompl. San Lorenzo' },
]

const FLAG_BADGE_CLASS: Record<string, string> = {
  VIAJE_COMPLETO_MINIMO: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80',
  VOLCABLE_COMPLETO_MINIMO: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
  VIAJE_INCOMPLETO: 'bg-slate-200 text-slate-800',
  SOLO_VOLCABLE: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200/80',
  JOURNEY_SOSPECHOSO_LARGO: 'bg-rose-100 text-rose-900 ring-1 ring-rose-200/80',
  MIXTO_RICARDONE_SAN_LORENZO: 'bg-violet-100 text-violet-900 ring-1 ring-violet-200/80',
}

function QualityFlagBadge({ flag }: { flag: string }) {
  const cls = FLAG_BADGE_CLASS[flag] ?? 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  return <span className={`inline-block max-w-full truncate rounded px-1.5 py-0.5 font-mono text-[10px] ${cls}`}>{flag}</span>
}

export function formatDateTimeShort(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
}

export type RealJourneyDiagnosticsViewProps = {
  loading: boolean
  error: string | null
  dataSource: RealDataSource
  setDataSource: (v: RealDataSource) => void
  apiStartDate: string
  apiEndDate: string
  setApiStartDate: (v: string) => void
  setApiEndDate: (v: string) => void
  filePath: string
  setFilePath: (v: string) => void
  load: () => Promise<void>
  includeInvalidPlateDiagnostics: boolean
  setIncludeInvalidPlateDiagnostics: (v: boolean) => void
  selectedDay: string
  setSelectedDay: (v: string) => void
  calendarDayOptions: string[]
  calendarDayPickerIndex: number
  eventCountByCalendarDay: Map<string, number>
  formatCalendarDayOptionLabel: (dayKey: string, eventCount: number | undefined, countLabel: 'valid' | 'all_reads') => string
  eventMinDay: string
  eventMaxDay: string
  prelimCircuitFilter: string
  setPrelimCircuitFilter: (v: string) => void
  journeyQuickFilter: JourneyQuickFilter
  setJourneyQuickFilter: (v: JourneyQuickFilter) => void
  depurationScopeFilter: OperationalJourneyScopeFilter
  setDepurationScopeFilter: (v: OperationalJourneyScopeFilter) => void
  onlyThisPlateScope: boolean
  setOnlyThisPlateScope: (v: boolean) => void
  plateQuery: string
  setPlateQuery: (v: string) => void
  plateNorm: string
  interplantWindowHours: number
  setInterplantWindowHours: (v: number) => void
  mainTab: RealDataMainTab
  setMainTab: (v: RealDataMainTab) => void

  journeys: ReconstructedRealJourney[]
  events: RealJourneyEventDto[]
  plateQualitySummary: PlateQualitySummaryResult
  depurationSnapshot: OperationalDepurationSnapshot
  donutJourneys: {
    usefulKpi: number
    discarded: number
    incompleteReal: number
    diagOnly: number
    total: number
  }
  prelimCircuitCardMetrics: {
    totalOperational: number
    volcable: number
    sinVolcable: number
    caladaSl: number
    liquido: number
    loopBalanza: number
    soloVolcable: number
    incompletos: number
    minIngEgr: number
    minPreEg: number
    partialIngBal: number
    partialPreBal: number
  }
  circuitBarItems: { id: string; label: string; count: number; colorClass?: string }[]
  circuitSummaryRows: {
    code: string
    count: number
    uniquePlates: number
    meanDur: number
    p90: number
    confidence: string
  }[]
  cameraCoverageSummary: CameraCoverageBuildResult
  cameraStatusCounts: { activas: number; parciales: number; baja: number; repetitiva: number; combos: number }
  topInvalidPlateReading: string
  plateEventsAll: RealJourneyEventDto[]
  plateJourneysFull: ReconstructedRealJourney[]
  plateSummary: {
    totalEvents: number
    totalJourneys: number
    firstAt: string
    lastAt: string
    dayCount: number
    sectors: string[]
    devices: string[]
    circuits: string[]
    flagTop: [string, number][]
  } | null
  plateQueryFormatWarning: boolean
  plateTimelineRows: ReturnType<typeof import('../services/realPlateAudit').buildPlateEventRows>
  interplantHintsForPlate: ReturnType<typeof import('../services/realPlateAudit').detectRicardoneEgressToSanLorenzoWindow>
  plateMilestoneTimeline: { slot: string; event: RealJourneyEventDto | undefined }[]
  downloadPlateCsv: () => void
  incompleteGroups: IncompleteSequenceGroup[]
  incompleteTotal: number
  incompleteRankings: {
    topSignature: string
    topCount: number
    pctTop5: number
    withIngreso: number
    withBalanza: number
    withVolcable: number
    withEgreso: number
    onlySlFull: number
  }
  depurationExecutiveRows: {
    key: string
    label: string
    count: number
    pct: number
    reason: string
    kpi: 'Sí' | 'No' | 'Parcial'
  }[]
  topDiscardInfo: { label: string; count: number; detail: string }
  integrityLabel: { tone: 'emerald' | 'amber' | 'rose'; text: string }
  datasetQualityBadge: { cls: string; text: string }
  filteredJourneys: ReconstructedRealJourney[]
  filteredPlateRows: ReturnType<typeof import('../services/realJourneyQuality').buildPlateRowsByDay>
  prelimCircuitDailyFiltered: import('../services/realPreliminaryCircuit').PreliminaryCircuitDailyRow[]

  drawerCircuitCode: string | null
  setDrawerCircuitCode: (v: string | null) => void
  drawerCircuitJourneys: ReconstructedRealJourney[]
  drawerIncompleteGroup: IncompleteSequenceGroup | null
  setDrawerIncompleteGroup: (v: IncompleteSequenceGroup | null) => void
}

export function RealJourneyDiagnosticsView(p: RealJourneyDiagnosticsViewProps) {
  const g = p.depurationSnapshot.general
  const raw = Math.max(1, g.rawJourneyCount)
  const afterSoloIe = Math.max(0, g.journeysReconstructedValidPlate - g.discardedSoloIngresoCount - g.discardedSoloEgresoCount)
  const discardRatePct = raw > 0 ? (1 - g.operationalUsefulJourneyCount / raw) * 100 : 0

  const funnelStages = [
    {
      title: 'Datos crudos',
      value: g.rawJourneyCount,
      badge: 'RAW',
      pctOfRaw: 1,
    },
    {
      title: 'Patentes válidas — journeys reconstruidos',
      value: g.journeysReconstructedValidPlate,
      badge: `${((g.journeysReconstructedValidPlate / raw) * 100).toFixed(1)}% retención`,
      pctOfRaw: g.rawJourneyCount > 0 ? g.journeysReconstructedValidPlate / raw : 0,
    },
    {
      title: 'Tras descartar solo ingreso / solo egreso (ruta probable)',
      value: afterSoloIe,
      badge: `${((afterSoloIe / raw) * 100).toFixed(1)}%`,
      pctOfRaw: g.rawJourneyCount > 0 ? afterSoloIe / raw : 0,
    },
    {
      title: 'Datos útiles — operativos',
      value: g.operationalUsefulJourneyCount,
      badge: `${((g.operationalUsefulJourneyCount / raw) * 100).toFixed(1)}% útil`,
      pctOfRaw: g.pctOperationalUsefulVsRaw,
    },
  ]

  const incTone =
    p.integrityLabel.tone === 'emerald'
      ? 'bg-emerald-500'
      : p.integrityLabel.tone === 'amber'
        ? 'bg-amber-500'
        : 'bg-rose-500'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto pb-10">
      <header className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dataset Ricardone (sin puerto SL)</div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Datos reales</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Diagnóstico operativo y calidad de ingesta. Circuitos observables aquí siguen siendo{' '}
              <span className="font-medium text-slate-800">preliminares</span>; no equivalen todavía a la matriz oficial R/SL.
            </p>
          </div>
          <span
            className={`inline-flex w-fit shrink-0 items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-slate-200/80 ${p.datasetQualityBadge.cls}`}
          >
            {p.datasetQualityBadge.text}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-700">
            <span>Origen</span>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
              <input type="radio" checked={p.dataSource === 'api'} onChange={() => p.setDataSource('api')} className="rounded" /> API{' '}
              <span className="font-normal text-slate-500">{resolveJourneyEventApiOrigin()}</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
              <input type="radio" checked={p.dataSource === 'file'} onChange={() => p.setDataSource('file')} className="rounded" />{' '}
              Archivo
            </label>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <input
              type="checkbox"
              checked={p.includeInvalidPlateDiagnostics}
              onChange={(e) => p.setIncludeInvalidPlateDiagnostics(e.target.checked)}
            />
            Conteos día incluyen OCR inválido (solo diagnóstico visual)
          </label>
          {p.dataSource === 'api' ? (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] font-medium text-slate-500">Desde</label>
                <input type="date" value={p.apiStartDate} onChange={(e) => p.setApiStartDate(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-500">Hasta</label>
                <input type="date" value={p.apiEndDate} onChange={(e) => p.setApiEndDate(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
              </div>
            </div>
          ) : (
            <div className="min-w-[260px] flex-1">
              <label className="block text-[10px] font-medium text-slate-500">Ruta (public)</label>
              <input value={p.filePath} onChange={(e) => p.setFilePath(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" />
            </div>
          )}
          <button
            type="button"
            onClick={() => void p.load()}
            disabled={p.loading || (p.dataSource === 'api' && (!p.apiStartDate || !p.apiEndDate))}
            className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            {p.loading ? 'Cargando…' : p.dataSource === 'api' ? 'Cargar desde API' : 'Recargar archivo'}
          </button>
          <div className="flex min-w-[200px] flex-1 flex-wrap items-end gap-2">
            <label className="block w-full text-[10px] font-medium text-slate-500">Día</label>
            <button
              type="button"
              disabled={p.calendarDayPickerIndex <= 0}
              onClick={() => {
                const opts = p.calendarDayOptions
                const i = p.calendarDayPickerIndex
                if (i > 0) p.setSelectedDay(opts[i - 1])
              }}
              className="rounded-xl border px-3 py-2 text-xs disabled:opacity-40"
            >
              ◀
            </button>
            <select
              value={p.selectedDay}
              onChange={(e) => p.setSelectedDay(e.target.value)}
              className="min-w-[200px] flex-1 rounded-xl border px-3 py-2 text-sm"
            >
              <option value="">Todos los días</option>
              {p.calendarDayOptions.map((d) => (
                <option key={d} value={d}>
                  {p.formatCalendarDayOptionLabel(d, p.eventCountByCalendarDay.get(d), p.includeInvalidPlateDiagnostics ? 'all_reads' : 'valid')}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={p.calendarDayPickerIndex < 0 || p.calendarDayPickerIndex >= p.calendarDayOptions.length - 1}
              onClick={() => {
                const opts = p.calendarDayOptions
                const i = p.calendarDayPickerIndex
                if (i >= 0 && i < opts.length - 1) p.setSelectedDay(opts[i + 1])
              }}
              className="rounded-xl border px-3 py-2 text-xs disabled:opacity-40"
            >
              ▶
            </button>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-[10px] font-medium text-slate-500">Circuito preliminar (filtros técnicos)</label>
            <select value={p.prelimCircuitFilter} onChange={(e) => p.setPrelimCircuitFilter(e.target.value)} className="w-full rounded-xl border px-3 py-2 font-mono text-xs">
              <option value="">Todos</option>
              {OBSERVABLE_JOURNEY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        {p.eventMinDay && p.eventMaxDay ? (
          <p className="mt-4 text-[11px] text-slate-500">
            Rango cargado Ricardone: <span className="font-mono">{p.eventMinDay}</span> → <span className="font-mono">{p.eventMaxDay}</span>
          </p>
        ) : null}
        {p.error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{p.error}</div> : null}
      </header>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {MAIN_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => p.setMainTab(t.id)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${p.mainTab === t.id ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {p.mainTab === 'resumen' && (
        <section className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ExecutiveMetricCard label="Eventos recibidos (Ricardone)" value={p.events.length.toLocaleString()} />
            <ExecutiveMetricCard
              accent="green"
              label="Patentes válidas (eventos)"
              value={p.plateQualitySummary.validPlateEvents.toLocaleString()}
              sub={`${(p.plateQualitySummary.validPlateEventRatio * 100).toFixed(1)}% del volumen`}
            />
            <ExecutiveMetricCard
              accent="rose"
              label="Patentes inválidas / OCR"
              value={p.plateQualitySummary.invalidPlateEvents.toLocaleString()}
              sub={`${(p.plateQualitySummary.invalidPlateEventRatio * 100).toFixed(1)}%`}
            />
            <ExecutiveMetricCard label="Journeys reconstruidos" value={p.journeys.length.toLocaleString()} />
            <ExecutiveMetricCard
              accent="green"
              label="Journeys operativos útiles"
              value={p.depurationSnapshot.general.operationalUsefulJourneyCount.toLocaleString()}
            />
            <ExecutiveMetricCard
              accent="rose"
              label="Journeys descartados (ruido/clasificación)"
              value={(p.depurationSnapshot.general.totalDiscardedJourneyCount - p.depurationSnapshot.general.invalidPlateOnlyJourneyCount).toLocaleString()}
              sub="Excluye journeyUid sólo OCR inválido (ver depuración)"
            />
            <ExecutiveMetricCard
              label="% utilizable sobre crudos"
              value={`${(p.depurationSnapshot.general.pctOperationalUsefulVsRaw * 100).toFixed(1)}%`}
              accent="green"
            />
            <ExecutiveMetricCard
              label="% descartado sobre crudos"
              value={`${(p.depurationSnapshot.general.pctDiscardedVsRaw * 100).toFixed(1)}%`}
              accent="rose"
            />
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Distribución de datos procesados</h2>
              <p className="mt-1 text-sm text-slate-600">Journey reconstruido = unidad fuente tras patente válida (vista período/día).</p>
              <div className="mt-8 flex justify-center">
                <DataDistributionDonut
                  centerLabel="Journeys"
                  slices={[
                    { label: 'Datos útiles (KPI prelim)', count: p.donutJourneys.usefulKpi, colorVar: '--c0' },
                    { label: 'Descartados operativamente', count: p.donutJourneys.discarded, colorVar: '--c1' },
                    { label: 'Incompletos reales', count: p.donutJourneys.incompleteReal, colorVar: '--c2' },
                    { label: 'Solo diagnóstico (otros)', count: p.donutJourneys.diagOnly, colorVar: '--c3' },
                  ]}
                />
              </div>
            </div>
            <div className="rounded-3xl border border-blue-950/35 bg-gradient-to-b from-[#162456] via-[#1a2f6e] to-[#0f1a42] p-7 text-blue-50 shadow-lg">
              <div className="flex items-start gap-2">
                <span className="text-xl" aria-hidden>
                  ●
                </span>
                <div>
                  <h2 className="text-lg font-bold text-white">Qué podemos calcular</h2>
                  <p className="mt-2 text-sm text-blue-100/95">Interpretación ejecutiva sobre la ingestión observable en Ricardone.</p>
                </div>
              </div>
              <div className="mt-8 space-y-8 text-sm">
                <div>
                  <div className="flex items-center gap-2 font-bold text-emerald-200">
                    <span aria-hidden className="h-5 w-5 rounded-full bg-emerald-500/80 ring-2 ring-emerald-200/60" /> CONFIABLE
                  </div>
                  <ul className="mt-3 list-none space-y-2 pl-1 text-blue-50/98">
                    <li>● Ingresos y egresos Ricardone con secuencias captadas</li>
                    <li>● Flujo mínimo ingreso / egreso cuando las cámaras lo muestran</li>
                  </ul>
                </div>
                <div>
                  <div className="flex items-center gap-2 font-bold text-amber-200">
                    <span aria-hidden className="h-5 w-5 rounded-full bg-amber-500/80 ring-2 ring-amber-200/60" /> PRELIMINAR
                  </div>
                  <ul className="mt-3 list-none space-y-2 pl-1 text-blue-50/92">
                    <li>● Tiempos aproximados ingreso‑egreso (recorridos parciales o saltos entre cámaras)</li>
                    <li>● Recorridos mínimos y circuitos agrupados en esta página</li>
                  </ul>
                </div>
                <div>
                  <div className="flex items-center gap-2 font-bold text-rose-200">
                    <span aria-hidden className="h-5 w-5 rounded-full bg-rose-600/85 ring-2 ring-rose-300/55" /> NO DISPONIBLE
                  </div>
                  <ul className="mt-3 list-none space-y-2 pl-1 text-blue-50/92">
                    <li>● Circuitos oficiales planta vs matriz R/SL aquí declarados fuera del alcance de esta ingestión.</li>
                    <li>● Anomalías y variaciones oficiales KPI finales hasta validar modelo de datos.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {p.mainTab === 'depuracion' && (
        <section className="space-y-8">
          <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Flujo de calidad de datos</h2>
              <p className="mt-1 text-sm text-slate-600">
                Embudo sobre journeyUid Ricardone crudo: reconstrucción con patente válida, exclusiones de solo ingreso/solo egreso (ruta probable) y
                utilidad operativa final.
              </p>
              <div className="mt-8 flex justify-center px-2">
                <DataQualityFunnel stages={funnelStages} />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <ExecutiveMetricCard
                accent="rose"
                label="Tasa de descarte (exploratoria)"
                value={`${discardRatePct.toFixed(1)} %`}
                sub={`1 − operativos útiles / datos crudos`}
              />
              <div className="flex items-stretch gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className={`w-1 shrink-0 rounded-full ${incTone}`} />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estado de integridad</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{p.integrityLabel.text}</div>
                </div>
              </div>
              <ExecutiveMetricCard
                accent="rose"
                label="Principal categoría DESCARTADO"
                value={p.topDiscardInfo.count > 0 ? p.topDiscardInfo.label : '—'}
                sub={p.topDiscardInfo.count > 0 ? p.topDiscardInfo.detail : 'Sin descartes etiquetados DESCARTADO_* en el período.'}
              />
              <ExecutiveMetricCard
                label="Calidad del dataset (KPI prelim)"
                value={p.depurationSnapshot.general.preliminaryValidPatternCount.toLocaleString()}
                sub="Patrones preliminares distintos de INCOMPLETO y no descartados (ver mapa servicio)."
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Análisis de categorías (ejecutivo)</h3>
            <p className="mt-1 text-sm text-slate-600">
              Mismos números que el mapa operativo; formato compacto para comité. KPI = si alimenta KPIs primarios de esta capa.
            </p>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-[640px] w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-3 pr-3">Categoría</th>
                    <th className="py-3 pr-3 text-right">Cantidad</th>
                    <th className="py-3 pr-3 text-right">% / crudo</th>
                    <th className="py-3 pr-6">Motivo</th>
                    <th className="py-3 text-center">Se usa en KPI</th>
                  </tr>
                </thead>
                <tbody>
                  {p.depurationExecutiveRows.map((r) => (
                    <tr key={r.key} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-3 font-medium text-slate-900">{r.label}</td>
                      <td className="py-3 pr-3 text-right tabular-nums font-semibold">{r.count.toLocaleString()}</td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center justify-end gap-2">
                          <span className="tabular-nums text-slate-800">{(r.pct * 100).toFixed(1)}%</span>
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-2 rounded-full bg-slate-400" style={{ width: `${Math.min(100, r.pct * 100)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="max-w-md py-3 pr-6 text-slate-600">{r.reason}</td>
                      <td className="py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            r.kpi === 'Sí'
                              ? 'bg-emerald-100 text-emerald-900'
                              : r.kpi === 'Parcial'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {r.kpi}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <details className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm open:shadow-md">
            <summary className="cursor-pointer select-none text-sm font-semibold text-slate-800">
              Ver detalle técnico — secuencias lógicas (depuración)
            </summary>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {DEPURATION_SCOPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => p.setDepurationScopeFilter(opt.id)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      p.depurationScopeFilter === opt.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="max-h-[40vh] overflow-auto rounded-xl border border-slate-100">
                <table className="min-w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-left">Secuencia lógica</th>
                      <th className="px-2 py-2 text-right">Crudo</th>
                      <th className="px-2 py-2 text-right">Desc.</th>
                      <th className="px-2 py-2 text-right">Útil</th>
                      <th className="px-2 py-2 font-mono">Preliminar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.depurationSnapshot.sequenceRows.slice(0, 80).map((r) => (
                      <tr key={r.logicalSignature} className="border-t border-slate-100">
                        <td className="max-w-md truncate px-2 py-2 font-mono text-[10px]" title={r.logicalSignature}>
                          {r.logicalSignature.length > 120 ? `${r.logicalSignature.slice(0, 120)}…` : r.logicalSignature}
                        </td>
                        <td className="px-2 py-2 text-right">{r.countRaw}</td>
                        <td className="px-2 py-2 text-right">{r.countDiscarded}</td>
                        <td className="px-2 py-2 text-right">{r.countUseful}</td>
                        <td className="max-w-[160px] truncate px-2 py-2 font-mono text-[9px]">{r.preliminaryClassification}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </section>
      )}

      {p.mainTab === 'circuitos' && (
        <section className="space-y-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['Mín. Ingreso→Egreso', p.prelimCircuitCardMetrics.minIngEgr],
                ['Mín. Preingreso→Egreso', p.prelimCircuitCardMetrics.minPreEg],
                ['Parcial Ingreso→Balanza', p.prelimCircuitCardMetrics.partialIngBal],
                ['Parcial Preingreso→Balanza', p.prelimCircuitCardMetrics.partialPreBal],
                ['Descarga sin Volcable', p.prelimCircuitCardMetrics.sinVolcable],
                ['Descarga Volcable', p.prelimCircuitCardMetrics.volcable],
                ['Calada probable SL', p.prelimCircuitCardMetrics.caladaSl],
                ['Loop Balanza', p.prelimCircuitCardMetrics.loopBalanza],
              ] as const
            ).map(([label, value]) => (
              <ExecutiveMetricCard key={label} label={`${label} (útiles)`} value={value} />
            ))}
            <ExecutiveMetricCard accent="amber" label="Incompletos reales (útiles)" value={p.prelimCircuitCardMetrics.incompletos} />
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <HorizontalBarChart
              items={p.circuitBarItems}
              title="Circuito observado vs volumen"
              onPick={(id) => p.setDrawerCircuitCode(id)}
            />
            <ExecutiveMetricCard
              label="Journeys operativamente útiles (alcance día)"
              value={p.prelimCircuitCardMetrics.totalOperational}
              sub={p.selectedDay ? `Filtrados al día ${p.selectedDay}` : 'Todos los días Ricardone en carga'}
            />
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Resumen compacto por circuito</h3>
            <p className="mt-1 text-sm text-slate-600">Click en una fila para ver ejemplos en el panel lateral.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-3 pr-2">Circuito</th>
                    <th className="py-3 pr-2 text-right">Cantidad</th>
                    <th className="py-3 pr-2 text-right">Patentes únicas</th>
                    <th className="py-3 pr-2 text-right">Duración media</th>
                    <th className="py-3 pr-2 text-right">P90</th>
                    <th className="py-3 pr-2">Confianza</th>
                  </tr>
                </thead>
                <tbody>
                  {p.circuitSummaryRows.map((row) => (
                    <tr
                      key={row.code}
                      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                      onClick={() => p.setDrawerCircuitCode(row.code)}
                    >
                      <td className="py-3 pr-2 font-mono text-xs font-semibold text-slate-900">{row.code}</td>
                      <td className="py-3 pr-2 text-right tabular-nums">{row.count}</td>
                      <td className="py-3 pr-2 text-right tabular-nums">{row.uniquePlates}</td>
                      <td className="py-3 pr-2 text-right tabular-nums">{row.meanDur} min</td>
                      <td className="py-3 pr-2 text-right tabular-nums">{row.p90} min</td>
                      <td className="py-3 pr-2 capitalize">{row.confidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <details className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <summary className="cursor-pointer select-none text-sm font-semibold text-slate-800">Ver tablas técnicas — desglose diario × circuito</summary>
            <div className="mt-4 max-h-[48vh] overflow-auto rounded-xl border border-slate-100">
              <table className="min-w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left">Día</th>
                    <th className="px-2 py-2 font-mono text-left">Circuito</th>
                    <th className="min-w-[220px] px-2 py-2 text-left">Secuencia típica</th>
                    <th className="px-2 py-2 text-right">J.</th>
                    <th className="px-2 py-2 text-right">Pat.</th>
                    <th className="px-2 py-2 text-right">Ømin</th>
                    <th className="px-2 py-2 text-right">P90</th>
                  </tr>
                </thead>
                <tbody>
                  {p.prelimCircuitDailyFiltered.map((row) => (
                    <tr key={`${row.day}-${row.preliminaryCircuitCode}`} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-2 py-2 font-mono">{row.day}</td>
                      <td className="max-w-[200px] truncate px-2 py-2 font-mono text-[10px]">{row.preliminaryCircuitCode}</td>
                      <td className="max-w-[440px] px-2 py-2 font-mono text-[10px] text-slate-700">{preliminaryCircuitTypicalSectorPath(row.preliminaryCircuitCode)}</td>
                      <td className="px-2 py-2 text-right">{row.journeyCount}</td>
                      <td className="px-2 py-2 text-right">{row.uniquePlateCount}</td>
                      <td className="px-2 py-2 text-right">{row.meanDurationMinutes}</td>
                      <td className="px-2 py-2 text-right">{row.p90DurationMinutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}

      {p.mainTab === 'incompletos' && (
        <section className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <ExecutiveMetricCard accent="amber" label="Total incompletos reales" value={p.incompleteTotal} />
            <ExecutiveMetricCard
              accent="amber"
              label="Secuencia más frecuente"
              value={
                (p.incompleteRankings.topSignature ?? '—').length > 52
                  ? `${(p.incompleteRankings.topSignature ?? '').slice(0, 52)}…`
                  : (p.incompleteRankings.topSignature ?? '—')
              }
              sub={`${p.incompleteRankings.topCount} viajes`}
            />
            <ExecutiveMetricCard accent="green" label="% explicado top 5" value={`${p.incompleteRankings.pctTop5.toFixed(1)}%`} />
            <ExecutiveMetricCard label="+ Ingreso" value={p.incompleteRankings.withIngreso} />
            <ExecutiveMetricCard label="+ Balanza" value={p.incompleteRankings.withBalanza} />
            <ExecutiveMetricCard label="+ Egreso" value={p.incompleteRankings.withEgreso} />
          </div>

          <div className="space-y-4">
            {p.incompleteGroups.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
                Sin viajes PRELIM_INCOMPLETO con filtros vigentes.
              </p>
            ) : (
              p.incompleteGroups.slice(0, 16).map((g) => (
                <article key={g.signature} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold uppercase text-slate-500">Secuencia</div>
                      <p className="mt-1 break-all font-mono text-[12px] font-semibold text-slate-900">{g.signature}</p>
                    </div>
                    <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                      <div className="text-2xl font-bold tabular-nums text-slate-900">{g.count}</div>
                      <div className="mt-1 text-xs text-slate-600">{pctOfIncomplete(g.count, p.incompleteTotal).toFixed(1)}% incompletos</div>
                    </div>
                  </div>
                  <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-slate-700">Elementos observados</dt>
                      <dd className="mt-1 text-slate-600">{g.elementsPresentLabels}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-700">Faltantes rutas típicas</dt>
                      <dd className="mt-1 font-mono text-xs text-slate-600">{g.missingElements.join(', ') || '—'}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 text-sm">
                    <div className="font-semibold text-slate-800">Interpretación posible</div>
                    <p className="mt-1 text-slate-600">{g.possibleInterpretation}</p>
                  </div>
                  <div className="mt-3 text-sm">
                    <div className="font-semibold text-slate-800">Acción sugerida</div>
                    <p className="mt-1 text-slate-600">{g.suggestedAction}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {g.candidatePattern ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200">
                        Posible nuevo patrón
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => p.setDrawerIncompleteGroup(g)}
                      className="ml-auto rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Ver ejemplos
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {p.mainTab === 'camaras' && (
        <section className="space-y-10">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Calidad de lectura de patentes</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ExecutiveMetricCard accent="green" label="Eventos patente válida" value={p.plateQualitySummary.validPlateEvents} />
              <ExecutiveMetricCard accent="rose" label="Eventos patente inválida" value={p.plateQualitySummary.invalidPlateEvents} />
              <ExecutiveMetricCard label="% inválidas" value={`${(p.plateQualitySummary.invalidPlateEventRatio * 100).toFixed(1)} %`} />
              <ExecutiveMetricCard label="Lectura OCR inválida más frecuente" value={p.topInvalidPlateReading} sub="valor crudo" />
            </div>
            <details className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <summary className="cursor-pointer select-none font-semibold text-slate-800">Tablas técnicas adicionales (inválidas por sector/cámara)</summary>
              <div className="mt-4 max-h-[260px] overflow-auto rounded-xl border bg-white">
                <table className="min-w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-left">sectorCode</th>
                      <th className="px-2 py-2 text-left">deviceCode</th>
                      <th className="px-2 py-2 text-right">Evts</th>
                      <th className="px-2 py-2 text-right">Invál.</th>
                      <th className="px-2 py-2 text-right">%</th>
                      <th className="min-w-[200px] px-2 py-2 text-left">Top OCR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.plateQualitySummary.invalidByCameraRows.map((row) => (
                      <tr key={`${row.sectorCode}-${row.deviceCode}`} className="border-t border-slate-100">
                        <td className="truncate px-2 py-2 font-mono">{row.sectorCode}</td>
                        <td className="truncate px-2 py-2 font-mono">{row.deviceCode}</td>
                        <td className="px-2 py-2 text-right">{row.totalEvents}</td>
                        <td className="px-2 py-2 text-right">{row.invalidPlateEvents}</td>
                        <td className="px-2 py-2 text-right">{(row.pctInvalid * 100).toFixed(1)}%</td>
                        <td className="px-2 py-2 font-mono text-[9px]">{row.topInvalidReadingsSummary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Lectura OCR</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2 font-mono text-left">Cámara top</th>
                    <th className="px-3 py-2 font-mono text-left">Sector top</th>
                    <th className="px-3 py-2 text-left">Primer evt</th>
                    <th className="px-3 py-2 text-left">Último evt</th>
                  </tr>
                </thead>
                <tbody>
                  {p.plateQualitySummary.topInvalidPlateReadings.slice(0, 35).map((r) => (
                    <tr key={`${r.truckPlateOriginal}-${r.normalizedPlate}`} className="border-t border-slate-100">
                      <td className="max-w-[120px] truncate px-3 py-2 font-mono text-[11px]">{r.truckPlateOriginal}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.eventCount}</td>
                      <td className="truncate px-3 py-2 font-mono text-[11px]">{r.topDeviceCode}</td>
                      <td className="truncate px-3 py-2 font-mono text-[11px]">{r.topSectorCode}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.firstOccurredAt ? formatDateTimeShort(r.firstOccurredAt) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.lastOccurredAt ? formatDateTimeShort(r.lastOccurredAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Cobertura de cámaras</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ExecutiveMetricCard accent="green" label="Cámaras / combos activas (completo)" value={p.cameraStatusCounts.activas} />
              <ExecutiveMetricCard accent="amber" label="Cobertura parcial de días" value={p.cameraStatusCounts.parciales} />
              <ExecutiveMetricCard label="Actividad baja (heurística)" value={p.cameraStatusCounts.baja} />
              <ExecutiveMetricCard label="Actividad repetitiva" value={p.cameraStatusCounts.repetitiva} />
              <ExecutiveMetricCard label="Combinaciones observadas (sector×device)" value={p.cameraStatusCounts.combos} />
            </div>
            <div className="mt-6 max-h-[48vh] overflow-auto rounded-xl border border-slate-100">
              <table className="min-w-[960px] w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 font-mono text-left">Sector</th>
                    <th className="px-2 py-2 font-mono text-left">Cámara</th>
                    <th className="px-2 py-2 text-left">Primer</th>
                    <th className="px-2 py-2 text-left">Último</th>
                    <th className="px-2 py-2 text-right">Evts</th>
                    <th className="px-2 py-2 text-right">Pat.</th>
                    <th className="px-2 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {p.cameraCoverageSummary.rows.map((r) => (
                    <tr key={`${r.sectorCode}-${r.deviceCode}`} className="border-t border-slate-100">
                      <td className="max-w-[180px] truncate px-2 py-2 font-mono">{r.sectorCode}</td>
                      <td className="max-w-[120px] truncate px-2 py-2 font-mono">{r.deviceCode}</td>
                      <td className="whitespace-nowrap px-2 py-2">{r.firstEventAt ? formatDateTimeShort(r.firstEventAt) : '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2">{r.lastEventAt ? formatDateTimeShort(r.lastEventAt) : '—'}</td>
                      <td className="px-2 py-2 text-right">{r.totalEventCount}</td>
                      <td className="px-2 py-2 text-right">{r.uniquePlateCount}</td>
                      <td className="max-w-[220px] truncate px-2 py-2 font-mono text-[10px]" title={r.coverageStatus}>
                        {r.coverageStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {p.mainTab === 'buscar' && (
        <section className="space-y-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-md">
            <label className="text-sm font-semibold uppercase tracking-wide text-slate-500">Buscar patente</label>
            <input
              value={p.plateQuery}
              onChange={(e) => p.setPlateQuery(e.target.value)}
              placeholder="Ej. ABC123 o AB123CD"
              className="mt-3 w-full rounded-2xl border-2 border-slate-900/70 px-5 py-4 text-xl font-mono outline-none shadow-inner focus:border-sky-600"
            />
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={p.onlyThisPlateScope} onChange={(e) => p.setOnlyThisPlateScope(e.target.checked)} disabled={!p.plateNorm} />
                Filtrar otras pestañas por esta patente
              </label>
              <div className="flex items-center gap-2">
                <span>Ventana interplanta (h)</span>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={p.interplantWindowHours}
                  onChange={(e) => p.setInterplantWindowHours(Math.min(12, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-20 rounded-lg border px-2 py-2"
                />
              </div>
              <button type="button" onClick={() => p.setPlateQuery('')} className="rounded-xl border px-4 py-2 font-medium hover:bg-slate-50">
                Limpiar
              </button>
              <button
                type="button"
                disabled={p.plateTimelineRows.length === 0}
                onClick={p.downloadPlateCsv}
                className="rounded-xl bg-slate-900 px-5 py-2 font-semibold text-white disabled:opacity-40"
              >
                CSV eventos
              </button>
            </div>
            {p.plateQueryFormatWarning ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Consulta fuera del formato habitual de patente Argentina.
              </p>
            ) : null}
          </div>

          {p.plateNorm && p.plateSummary && (
            <>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900">Resumen de patente</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <ExecutiveMetricCard label="Eventos" value={p.plateSummary.totalEvents} />
                  <ExecutiveMetricCard label="Journeys válidos reconstr." value={p.plateSummary.totalJourneys} />
                  <ExecutiveMetricCard label="Primer evento" value={p.plateSummary.firstAt ? formatDateTimeShort(p.plateSummary.firstAt) : '—'} />
                  <ExecutiveMetricCard label="Último evento" value={p.plateSummary.lastAt ? formatDateTimeShort(p.plateSummary.lastAt) : '—'} />
                  <ExecutiveMetricCard label="Días activos" value={p.plateSummary.dayCount} />
                </div>
                <p className="mt-6 text-[11px] font-semibold uppercase text-slate-500">Circuitos observados</p>
                <p className="mt-2 font-mono text-xs">{p.plateSummary.circuits.join(', ') || '—'}</p>
                <div className="mt-6">
                  <h4 className="text-sm font-bold text-slate-900">Trayecto ejecutivo Ricardone</h4>
                  <div className="mt-4 flex flex-wrap items-stretch gap-2">
                    {p.plateMilestoneTimeline.map((step, idx) => (
                      <div key={step.slot} className="flex items-center gap-2">
                        <div
                          className={`rounded-2xl border-2 px-4 py-3 text-center shadow-sm ${step.event ? 'border-emerald-300 bg-emerald-50/50' : 'border-dashed border-slate-300 bg-slate-50'}`}
                        >
                          <div className="text-[10px] font-bold uppercase text-slate-500">{step.slot}</div>
                          {step.event ? (
                            <>
                              <div className="mt-1 font-mono text-[11px] font-semibold text-slate-900">{formatDateTimeShort(step.event.occurredAt)}</div>
                              <div className="mt-1 truncate font-mono text-[10px] text-slate-600">{step.event.sectorCode}</div>
                              <div className="truncate font-mono text-[10px] text-slate-500">{step.event.deviceCode}</div>
                              <div className="mt-1 font-mono text-[10px] text-sky-800">{normalizeRealEventPoint(step.event).logicalCode}</div>
                            </>
                          ) : (
                            <div className="mt-2 text-xs italic text-slate-400">Sin captura</div>
                          )}
                        </div>
                        {idx < p.plateMilestoneTimeline.length - 1 ? <span className="text-slate-400">→</span> : null}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500">
                    Muestra el primer hito por etapa dentro de todos los sectores cargados para la coincidencia.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {p.interplantHintsForPlate.map((hint, hi) => (
                  <div key={`${hint.journeyUidRicardone}-${hi}`} className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-sm text-indigo-950">
                    Posible Ricardone → San Lorenzo dentro de ventana configurada • Δ {(hint.deltaMs / 3600000).toFixed(2)} h
                  </div>
                ))}
                <h4 className="text-base font-bold text-slate-900">Por journeyUid</h4>
                {[...p.plateJourneysFull]
                  .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
                  .map((j) => (
                    <div key={j.journeyUid} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap gap-2 font-mono text-[11px] text-slate-700">
                        <span className="font-bold">{j.journeyUid}</span>
                        <span>Duración {j.durationMinutes} min</span>
                      </div>
                      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <div>
                          <span className="text-slate-500">Circuito</span>{' '}
                          <span className="font-mono font-semibold">{j.preliminaryCircuitCode}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Confianza</span> <span>{j.preliminaryCircuitConfidence}</span>
                        </div>
                      </dl>
                      <p className="mt-2 font-mono text-[11px] text-slate-900">{normalizeSequenceForPattern(j.logicalCodeSequence).join(' → ')}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">{normalizeSequenceForPattern(j.rawSectorSequence).join(' → ')}</p>
                      <div className="mt-2 flex flex-wrap gap-1">{j.qualityFlags.map((f) => (<QualityFlagBadge key={f} flag={f} />))}</div>
                    </div>
                  ))}
              </div>

              <details className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <summary className="cursor-pointer font-semibold text-slate-800">Ver tabla detallada de eventos crudos</summary>
                <div className="mt-4 max-h-[40vh] overflow-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-[10px]">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-2 py-1 text-left">Fecha</th>
                        <th className="px-2 py-1 font-mono text-left">logical</th>
                        <th className="px-2 py-1 font-mono text-left">sectorCode</th>
                        <th className="px-2 py-1 font-mono text-left">deviceCode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.plateTimelineRows.map((row, ri) => (
                        <tr key={`${row.journeyUid}-${ri}`} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-2 py-1">{formatDateTimeShort(row.occurredAt)}</td>
                          <td className="px-2 py-1 font-mono">{row.logicalCode}</td>
                          <td className="max-w-[120px] truncate px-2 py-1 font-mono">{row.sectorCode}</td>
                          <td className="max-w-[110px] truncate px-2 py-1 font-mono">{row.deviceCode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}

          {p.plateNorm && p.plateEventsAll.length === 0 ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">Sin lecturas encontradas para la consulta actual.</p>
          ) : null}
        </section>
      )}

      <details className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <summary className="cursor-pointer select-none font-semibold text-slate-800">Ver tabla técnica completa — journeys filtrados</summary>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUICK_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => p.setJourneyQuickFilter(opt.id)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  p.journeyQuickFilter === opt.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-100">
            <table className="min-w-max text-[11px]">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-2 py-2 text-left">Día</th>
                  <th className="px-2 py-2 text-left">Patente</th>
                  <th className="px-2 py-2 font-mono text-[10px]">journeyUid</th>
                  <th className="px-2 py-2 text-left">Inicio</th>
                  <th className="px-2 py-2 font-mono">prelimCircuit</th>
                  <th className="px-2 py-2 font-mono">logicalCodeSeq</th>
                  <th className="px-2 py-2 font-mono">flags</th>
                  <th className="px-2 py-2 text-center">desc.</th>
                  <th className="px-2 py-2 text-center">útil</th>
                </tr>
              </thead>
              <tbody>
                {p.filteredJourneys.map((j) => (
                  <tr key={j.journeyUid} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-2 py-2 font-mono">{j.day || '—'}</td>
                    <td className="px-2 py-2 font-semibold">{j.plate}</td>
                    <td className="max-w-[120px] truncate px-2 py-2 font-mono text-[10px]" title={j.journeyUid}>
                      {j.journeyUid}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{formatDateTimeShort(j.startedAt)}</td>
                    <td className="max-w-[160px] truncate px-2 py-2 font-mono text-[9px]" title={j.preliminaryCircuitCode}>{j.preliminaryCircuitCode}</td>
                    <td className="max-w-[260px] truncate px-2 py-2 font-mono text-[9px]" title={j.logicalCodeSequence.join(' → ')}>
                      {normalizeSequenceForPattern(j.logicalCodeSequence).join(' → ')}
                    </td>
                    <td className="max-w-[200px] px-2 py-2 text-[10px]">{j.qualityFlags.slice(0, 4).join('|')}</td>
                    <td className="px-2 py-2 text-center">{j.isDiscardedOperational ? 'Sí' : 'No'}</td>
                    <td className="px-2 py-2 text-center">{j.feedsOperationalAnalytics ? 'Sí' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <details className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <summary className="cursor-pointer font-semibold text-slate-800">Patentes repetidas por día — vista técnica</summary>
        <div className="mt-4 max-h-[40vh] overflow-auto rounded-xl border border-slate-100">
          <table className="min-w-[720px] w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Día</th>
                <th className="px-3 py-2 text-left">Patente</th>
                <th className="px-3 py-2 text-right">Ev.</th>
                <th className="px-3 py-2 text-right">J.</th>
                <th className="min-w-[200px] px-3 py-2 text-left font-mono">Sequence device</th>
              </tr>
            </thead>
            <tbody>
              {p.filteredPlateRows.slice(0, 80).map((r) => (
                <tr key={`${r.day}-${r.plate}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono">{r.day}</td>
                  <td className="px-3 py-2 font-semibold">{r.plate}</td>
                  <td className="px-3 py-2 text-right">{r.eventCount}</td>
                  <td className="px-3 py-2 text-right">{r.journeyCount}</td>
                  <td className="truncate px-3 py-2 font-mono text-[10px]">{r.camerasSequenceDetected || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-[11px] text-slate-600">
        GET público ejemplo:{' '}
        <code className="break-all rounded-lg bg-white px-2">{buildJourneyEventListPublicDisplayUrl(p.apiStartDate, p.apiEndDate)}</code>
      </section>

      <DiagDrawer open={Boolean(p.drawerCircuitCode)} title="Ejemplos por circuito" subtitle={p.drawerCircuitCode ?? ''} onClose={() => p.setDrawerCircuitCode(null)}>
        <ul className="space-y-4 text-[11px]">
          {p.drawerCircuitJourneys.map((j) => (
            <li key={j.journeyUid} className="rounded-2xl border border-slate-100 p-4">
              <div className="font-mono text-xs font-bold">{j.journeyUid}</div>
              <div className="mt-1">{j.normalizedPlate} · {formatDateTimeShort(j.startedAt)} → {formatDateTimeShort(j.endedAt)}</div>
              <p className="mt-2 font-mono text-[11px] text-slate-800">{normalizeSequenceForPattern(j.logicalCodeSequence).join(' → ')}</p>
            </li>
          ))}
        </ul>
      </DiagDrawer>

      <DiagDrawer
        open={Boolean(p.drawerIncompleteGroup)}
        title="Ejemplos — incompleto recurrente"
        subtitle={p.drawerIncompleteGroup?.signature ?? ''}
        onClose={() => p.setDrawerIncompleteGroup(null)}
      >
        {p.drawerIncompleteGroup ? (
          <ul className="space-y-3 text-[11px]">
            {p.drawerIncompleteGroup.journeys.slice(0, 25).map((j) => (
              <li key={j.journeyUid} className="rounded-xl border border-slate-100 p-3">
                <div className="font-mono text-xs">{j.journeyUid}</div>
                <div className="mt-1">
                  Pat. {j.plate} • {formatDateTimeShort(j.startedAt)}
                </div>
                <p className="mt-2 font-mono text-[10px]">{normalizeSequenceForPattern(j.logicalCodeSequence).join(' → ')}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </DiagDrawer>
    </div>
  )
}