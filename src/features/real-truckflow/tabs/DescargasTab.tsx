import { useState } from 'react'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { CaladaCamerasPanel } from './CaladaCamerasPanel'

type SedeTab = 'ricardone' | 'san-lorenzo'
type RicSubTab = 'volcables' | 'silos' | 'celda16'
type SlSubTab = 'volcables' | 'aceite-pto' | 'aceite-osl'

function SubTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
        active
          ? 'bg-violet-100 text-violet-900 ring-1 ring-violet-300'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}

export function DescargasTab() {
  const wb = useEtlWorkbenchOptional()
  const tr = wb?.transformResult

  const [sede, setSede] = useState<SedeTab>('ricardone')
  const [ricSub, setRicSub] = useState<RicSubTab>('volcables')
  const [slSub, setSlSub] = useState<SlSubTab>('volcables')

  const composed = wb?.composedRange ?? null
  const periodLabel = composed
    ? `${composed.from} → ${composed.to}`
    : wb?.loadSummary?.daysDetected
      ? wb.loadSummary.daysDetected.length === 1
        ? wb.loadSummary.daysDetected[0]
        : `${wb.loadSummary.daysDetected[0]} → ${wb.loadSummary.daysDetected[wb.loadSummary.daysDetected.length - 1]}`
      : '—'

  return (
    <div className="space-y-4">
      {/* Aviso de rango compuesto: de cuántas corridas se armó y qué días faltan (no incluidos
          por no tener corrida guardada en la versión de reglas vigente). Sin este aviso, un rango
          como «27/6 → 02/09» muestra en silencio solo los días que sí tienen corrida. */}
      {composed && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <div className="font-semibold">
            Rango compuesto {composed.from} → {composed.to} desde {composed.usedRunIds.length} corrida(s)
            guardada(s), sin reprocesar.
          </div>
          {composed.missingDays.length ? (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <strong>{composed.missingDays.length} día(s) del rango NO están incluidos</strong> (sin corrida
              guardada en la versión vigente): <span className="font-mono">{composed.missingDays.join(', ')}</span>.
              Los conteos de abajo son solo de los días cubiertos. Procesá esos días en «Análisis local» para
              incluirlos.
            </div>
          ) : null}
        </div>
      )}

      {/* Sede: Ricardone / San Lorenzo */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setSede('ricardone')}
          className={`px-4 py-2 font-semibold transition ${
            sede === 'ricardone'
              ? 'border-b-2 border-violet-600 text-violet-900'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Ricardone
        </button>
        <button
          onClick={() => setSede('san-lorenzo')}
          className={`px-4 py-2 font-semibold transition ${
            sede === 'san-lorenzo'
              ? 'border-b-2 border-violet-600 text-violet-900'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          San Lorenzo
        </button>
      </div>

      {/* ── Ricardone ── */}
      {sede === 'ricardone' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <SubTabButton active={ricSub === 'volcables'} onClick={() => setRicSub('volcables')}>
              Volcables (2)
            </SubTabButton>
            <SubTabButton active={ricSub === 'silos'} onClick={() => setRicSub('silos')}>
              Silos (5)
            </SubTabButton>
            <SubTabButton active={ricSub === 'celda16'} onClick={() => setRicSub('celda16')}>
              Celda 16 (4)
            </SubTabButton>
          </div>

          {ricSub === 'volcables' && (
            <CaladaCamerasPanel
              csv={tr?.csv.ricardone_volcable_events}
              checkedCircuits={new Set()}
              filterActive={false}
              periodLabel={periodLabel}
              labels={{
                entitySingular: 'volcable Ric',
                entityPlural: 'volcables Ric',
                columnHeader: 'Volcable Ric',
                trucksMetric: 'Camiones en volcables',
                activityMetric: 'Volcables con actividad',
                exportName: 'ricardone_volcables',
                tableName: 'ricardone_volcable_events',
              }}
            />
          )}

          {ricSub === 'silos' && (
            <CaladaCamerasPanel
              csv={tr?.csv.ricardone_silo_events}
              checkedCircuits={new Set()}
              filterActive={false}
              periodLabel={periodLabel}
              labels={{
                entitySingular: 'línea de silo',
                entityPlural: 'líneas de silo',
                columnHeader: 'Cámara de silo',
                trucksMetric: 'Camiones en silos',
                activityMetric: 'Cámaras con actividad',
                exportName: 'ricardone_silos',
                tableName: 'ricardone_silo_events',
              }}
            />
          )}

          {ricSub === 'celda16' && (
            <CaladaCamerasPanel
              csv={tr?.csv.ricardone_celda16_events}
              checkedCircuits={new Set()}
              filterActive={false}
              periodLabel={periodLabel}
              labels={{
                entitySingular: 'cámara Celda 16',
                entityPlural: 'cámaras Celda 16',
                columnHeader: 'Cámara Celda 16',
                trucksMetric: 'Camiones en Celda 16',
                activityMetric: 'Cámaras con actividad',
                exportName: 'ricardone_celda16',
                tableName: 'ricardone_celda16_events',
              }}
            />
          )}
        </div>
      )}

      {/* ── San Lorenzo ── */}
      {sede === 'san-lorenzo' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <SubTabButton active={slSub === 'volcables'} onClick={() => setSlSub('volcables')}>
              Volcables (5)
            </SubTabButton>
            <SubTabButton active={slSub === 'aceite-pto'} onClick={() => setSlSub('aceite-pto')}>
              Aceite Pto (4)
            </SubTabButton>
            <SubTabButton active={slSub === 'aceite-osl'} onClick={() => setSlSub('aceite-osl')}>
              Aceite OSL (4)
            </SubTabButton>
          </div>

          {slSub === 'volcables' && (
            <CaladaCamerasPanel
              csv={tr?.csv.san_lorenzo_volcable_events}
              checkedCircuits={new Set()}
              filterActive={false}
              periodLabel={periodLabel}
              labels={{
                entitySingular: 'calle del volcable SL',
                entityPlural: 'calles del volcable SL',
                columnHeader: 'Calle volcable SL',
                trucksMetric: 'Camiones en volcable SL',
                activityMetric: 'Calles con actividad',
                exportName: 'volcable_sl_calles',
                tableName: 'san_lorenzo_volcable_events',
                splitExcelVsCamera: true,
              }}
            />
          )}

          {slSub === 'aceite-pto' && (
            <CaladaCamerasPanel
              csv={tr?.csv.san_lorenzo_aceite_pto_events}
              checkedCircuits={new Set()}
              filterActive={false}
              periodLabel={periodLabel}
              labels={{
                entitySingular: 'balanza Aceite Pto',
                entityPlural: 'balanzas Aceite Pto',
                columnHeader: 'Cámara Aceite Pto',
                trucksMetric: 'Camiones en Aceite Pto',
                activityMetric: 'Cámaras con actividad',
                exportName: 'sl_aceite_pto',
                tableName: 'san_lorenzo_aceite_pto_events',
                showPatentesModal: true,
              }}
            />
          )}

          {slSub === 'aceite-osl' && (
            <CaladaCamerasPanel
              csv={tr?.csv.san_lorenzo_aceite_osl_events}
              checkedCircuits={new Set()}
              filterActive={false}
              periodLabel={periodLabel}
              labels={{
                entitySingular: 'cámara Aceite OSL',
                entityPlural: 'cámaras Aceite OSL',
                columnHeader: 'Cámara Aceite OSL',
                trucksMetric: 'Camiones en Aceite OSL',
                activityMetric: 'Cámaras con actividad',
                exportName: 'sl_aceite_osl',
                tableName: 'san_lorenzo_aceite_osl_events',
                showPatentesModal: true,
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
